import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFirestore } from '@/hooks/useFirestore';
import { useNotifications } from '@/contexts/NotificationContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  CheckCircle,
  XCircle,
  Bell,
  AlertCircle,
  Clock,
  BedDouble,
  Send
} from 'lucide-react';
import { WorkerTransfer, WorkerTransferNotification, Room, Worker } from '@shared/types';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function WorkerTransferNotifications() {
  const { user } = useAuth();
  const { data: rooms } = useFirestore<Room>('rooms');
  const { updateDocument: updateWorker } = useFirestore<Worker>('workers');
  const { data: users } = useFirestore('users');
  const { sendNotification } = useNotifications();
  const { toast } = useToast();

  const [pendingTransfers, setPendingTransfers] = useState<WorkerTransfer[]>([]);
  const [notifications, setNotifications] = useState<WorkerTransferNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<WorkerTransfer | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [roomAssignments, setRoomAssignments] = useState<{[workerId: string]: {chambre: string; secteur: string}}>({});

  // Load pending transfers and notifications
  useEffect(() => {
    if (!user?.fermeId) return;

    // Listen to pending worker transfers
    const transfersQuery = query(
      collection(db, 'worker_transfers'),
      where('toFermeId', '==', user.fermeId),
      where('status', '==', 'pending')
    );

    const unsubscribeTransfers = onSnapshot(transfersQuery, (snapshot) => {
      const transfers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkerTransfer[];
      setPendingTransfers(transfers);
    });

    // Listen to unread notifications
    const notificationsQuery = query(
      collection(db, 'worker_transfer_notifications'),
      where('toFermeId', '==', user.fermeId),
      where('status', 'in', ['unread', 'read'])
    );

    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkerTransferNotification[];
      setNotifications(notifs);
    });

    return () => {
      unsubscribeTransfers();
      unsubscribeNotifications();
    };
  }, [user?.fermeId]);

  const getAvailableRooms = (workerGender: 'homme' | 'femme') => {
    return rooms.filter(room => 
      room.fermeId === user?.fermeId && 
      room.genre === (workerGender === 'homme' ? 'hommes' : 'femmes') &&
      room.occupantsActuels < room.capaciteTotale
    );
  };

  const handleShowConfirmDialog = (transfer: WorkerTransfer) => {
    setSelectedTransfer(transfer);
    // Initialize room assignments
    const initialAssignments: {[workerId: string]: {chambre: string; secteur: string}} = {};
    transfer.workers.forEach(worker => {
      initialAssignments[worker.workerId] = {
        chambre: '',
        secteur: ''
      };
    });
    setRoomAssignments(initialAssignments);
    setShowConfirmDialog(true);
  };

  const handleUpdateRoomAssignment = (workerId: string, field: 'chambre' | 'secteur', value: string) => {
    setRoomAssignments(prev => ({
      ...prev,
      [workerId]: {
        ...prev[workerId],
        [field]: value
      }
    }));
  };

  const validateAssignments = () => {
    if (!selectedTransfer) return false;
    
    return selectedTransfer.workers.every(worker => {
      const assignment = roomAssignments[worker.workerId];
      return assignment && assignment.chambre && assignment.secteur;
    });
  };

  const handleConfirmTransfer = async () => {
    if (!selectedTransfer || !validateAssignments()) {
      toast({
        title: "Erreur",
        description: "Veuillez assigner une chambre et un secteur à tous les ouvriers.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const batch = writeBatch(db);

      // Update transfer document
      const transferRef = doc(db, 'worker_transfers', selectedTransfer.id);
      batch.update(transferRef, {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        receivedBy: user?.uid,
        receivedByName: user?.nom || user?.email,
        roomAssignments: roomAssignments
      });

      // Update each worker with proper history preservation
      for (const workerInfo of selectedTransfer.workers) {
        const assignment = roomAssignments[workerInfo.workerId];
        const workerRef = doc(db, 'workers', workerInfo.workerId);

        // Get current worker data to preserve history
        const workerDoc = await getDoc(workerRef);
        if (!workerDoc.exists()) continue;

        const currentWorker = workerDoc.data() as any;
        const transferDate = new Date().toISOString().split('T')[0];

        // Preserve existing work history and properly close current period
        const existingHistory = currentWorker.workHistory || [];
        let completeHistory = [...existingHistory];

        // Check if the main worker's current period is already in work history
        const mainPeriodInHistory = existingHistory.some((period: any) =>
          period.dateEntree === currentWorker.dateEntree
        );

        // If main period is not in history, add it with proper closure
        if (!mainPeriodInHistory && currentWorker.dateEntree) {
          const mainPeriod = {
            id: `transfer_period_${Date.now()}_${workerInfo.workerId}`,
            dateEntree: currentWorker.dateEntree,
            dateSortie: transferDate, // Exit date = transfer date
            motif: 'transfert', // Set transfer as reason
            chambre: currentWorker.chambre,
            secteur: currentWorker.secteur,
            fermeId: currentWorker.fermeId
          };
          completeHistory.push(mainPeriod);
        }

        // Ensure all previous periods are properly closed
        const closedHistory = completeHistory.map((period: any) => {
          if (!period.dateSortie && period.dateEntree !== transferDate) {
            return {
              ...period,
              dateSortie: transferDate, // Close with transfer date
              motif: period.motif || 'transfert'
            };
          }
          return period;
        });

        // Sort history by entry date
        closedHistory.sort((a: any, b: any) => new Date(a.dateEntree).getTime() - new Date(b.dateEntree).getTime());

        // Update worker with preserved history and new farm assignment
        batch.update(workerRef, {
          fermeId: selectedTransfer.toFermeId,
          chambre: assignment.chambre,
          secteur: assignment.secteur,
          dateEntree: transferDate, // Entry date = transfer date (same as exit date from previous farm)
          dateSortie: null, // Clear exit date for new period
          motif: null, // Clear exit motif for new period
          statut: 'actif',
          returnCount: (currentWorker.returnCount || 0) + 1,
          workHistory: [
            ...closedHistory, // Keep all previous history
            {
              id: `transfer_entry_${Date.now()}_${workerInfo.workerId}`,
              dateEntree: transferDate, // Entry date = transfer date
              chambre: assignment.chambre,
              secteur: assignment.secteur,
              fermeId: selectedTransfer.toFermeId
            }
          ]
        });

        // Update room occupancy
        const room = rooms.find(r => r.numero === assignment.chambre && r.fermeId === user?.fermeId);
        if (room) {
          const roomRef = doc(db, 'rooms', room.id);
          batch.update(roomRef, {
            listeOccupants: [...room.listeOccupants, workerInfo.workerId],
            occupantsActuels: room.occupantsActuels + 1,
            updatedAt: serverTimestamp()
          });
        }
      }

      // Update notifications
      const relatedNotifications = notifications.filter(n => n.transferId === selectedTransfer.id);
      for (const notification of relatedNotifications) {
        const notifRef = doc(db, 'worker_transfer_notifications', notification.id);
        batch.update(notifRef, {
          status: 'acknowledged',
          acknowledgedAt: serverTimestamp()
        });
      }

      await batch.commit();

      // Send notification to source farm admin about confirmation
      try {
        const sourceAdmins = users?.filter(u =>
          u.fermeId === selectedTransfer.fromFermeId &&
          (u.role === 'admin' || u.role === 'superadmin')
        ) || [];

        for (const admin of sourceAdmins) {
          await sendNotification({
            type: 'worker_transfer_confirmed',
            title: 'Transfert d\'ouvriers confirmé',
            message: `Le transfert de ${selectedTransfer.workers.length} ouvrier(s) vers ${selectedTransfer.toFermeName} a été confirmé et accepté.`,
            recipientId: admin.uid,
            priority: 'medium',
            fermeId: selectedTransfer.fromFermeId,
            createdAt: new Date(),
            read: false,
            data: {
              transferId: selectedTransfer.id,
              workerCount: selectedTransfer.workers.length,
              destinationFarm: selectedTransfer.toFermeName
            }
          });
        }
        console.log(`✅ Sent confirmation notification to ${sourceAdmins.length} admin(s) at ${selectedTransfer.fromFermeName}`);
      } catch (notificationError) {
        console.error('❌ Error sending confirmation notification:', notificationError);
      }

      toast({
        title: "Transfert confirmé",
        description: `${selectedTransfer.workers.length} ouvrier(s) ont été transférés avec succès.`,
      });

      setShowConfirmDialog(false);
      setSelectedTransfer(null);
      setRoomAssignments({});

    } catch (error: any) {
      console.error('Error confirming transfer:', error);
      toast({
        title: "Erreur",
        description: "Erreur lors de la confirmation du transfert.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectTransfer = async () => {
    if (!selectedTransfer) return;

    try {
      setLoading(true);
      const batch = writeBatch(db);

      // Update transfer document
      const transferRef = doc(db, 'worker_transfers', selectedTransfer.id);
      batch.update(transferRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: user?.uid,
        rejectedByName: user?.nom || user?.email,
        rejectionReason: rejectionReason
      });

      // Update notifications
      const relatedNotifications = notifications.filter(n => n.transferId === selectedTransfer.id);
      for (const notification of relatedNotifications) {
        const notifRef = doc(db, 'worker_transfer_notifications', notification.id);
        batch.update(notifRef, {
          status: 'acknowledged',
          acknowledgedAt: serverTimestamp()
        });
      }

      await batch.commit();

      // Send notification to source farm admin about rejection
      try {
        const sourceAdmins = users?.filter(u =>
          u.fermeId === selectedTransfer.fromFermeId &&
          (u.role === 'admin' || u.role === 'superadmin')
        ) || [];

        for (const admin of sourceAdmins) {
          await sendNotification({
            type: 'worker_transfer_rejected',
            title: 'Transfert d\'ouvriers rejeté',
            message: `Le transfert de ${selectedTransfer.workers.length} ouvrier(s) vers ${selectedTransfer.toFermeName} a été rejeté. Raison: ${rejectionReason || 'Non spécifiée'}`,
            recipientId: admin.uid,
            priority: 'high',
            fermeId: selectedTransfer.fromFermeId,
            createdAt: new Date(),
            read: false,
            data: {
              transferId: selectedTransfer.id,
              workerCount: selectedTransfer.workers.length,
              destinationFarm: selectedTransfer.toFermeName,
              rejectionReason: rejectionReason
            }
          });
        }
        console.log(`✅ Sent rejection notification to ${sourceAdmins.length} admin(s) at ${selectedTransfer.fromFermeName}`);
      } catch (notificationError) {
        console.error('❌ Error sending rejection notification:', notificationError);
      }

      toast({
        title: "Transfert rejeté",
        description: "Le transfert a été rejeté.",
      });

      setShowConfirmDialog(false);
      setSelectedTransfer(null);
      setRejectionReason('');

    } catch (error: any) {
      console.error('Error rejecting transfer:', error);
      toast({
        title: "Erreur",
        description: "Erreur lors du rejet du transfert.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (pendingTransfers.length === 0 && notifications.length === 0) {
    return null;
  }

  return (
    <>
      {/* Notification Banner */}
      {(pendingTransfers.length > 0 || notifications.length > 0) && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-900">
                {pendingTransfers.length > 0 && (
                  <span>{pendingTransfers.length} transfert(s) d'ouvriers en attente</span>
                )}
                {pendingTransfers.length > 0 && notifications.length > 0 && " | "}
                {notifications.length > 0 && (
                  <span>{notifications.length} notification(s) non lue(s)</span>
                )}
              </span>
            </div>
          </div>

          {/* Pending Transfers List */}
          {pendingTransfers.length > 0 && (
            <div className="mt-4 space-y-3">
              {pendingTransfers.map((transfer) => (
                <Card key={transfer.id} className="border border-orange-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center">
                        <Users className="mr-2 h-5 w-5 text-orange-600" />
                        Transfert de {transfer.fromFermeName}
                      </CardTitle>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                        <Clock className="mr-1 h-3 w-3" />
                        En attente
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          {transfer.workers.length} ouvrier(s)
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(transfer.createdAt.toDate()).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        {transfer.workers.slice(0, 3).map((worker) => (
                          <Badge key={worker.workerId} variant="outline" className="text-xs">
                            {worker.workerName}
                          </Badge>
                        ))}
                        {transfer.workers.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{transfer.workers.length - 3} autres
                          </Badge>
                        )}
                      </div>

                      {transfer.notes && (
                        <p className="text-sm text-gray-600 italic">"{transfer.notes}"</p>
                      )}

                      <div className="flex space-x-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleShowConfirmDialog(transfer)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Confirmer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedTransfer(transfer);
                            setShowConfirmDialog(true);
                          }}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Rejeter
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="w-[98vw] max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTransfer ? 'Confirmer le transfert' : 'Transfert'}
            </DialogTitle>
            <DialogDescription>
              {selectedTransfer && (
                <>
                  Assignez une chambre et un secteur à chaque ouvrier de {selectedTransfer.fromFermeName}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedTransfer && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Assignation des chambres et secteurs</h3>
                {selectedTransfer.workers.map((worker) => {
                  const availableRooms = getAvailableRooms(worker.sexe);
                  return (
                    <div key={worker.workerId} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{worker.workerName}</h4>
                          <p className="text-sm text-gray-600">
                            {worker.sexe === 'homme' ? 'Homme' : 'Femme'} • Matricule: {worker.matricule || 'N/A'}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {worker.sexe === 'homme' ? 'Hommes' : 'Femmes'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Chambre</Label>
                          <Select
                            value={roomAssignments[worker.workerId]?.chambre || ''}
                            onValueChange={(value) => handleUpdateRoomAssignment(worker.workerId, 'chambre', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner une chambre" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableRooms.map((room) => (
                                <SelectItem key={room.id} value={room.numero}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>Chambre {room.numero}</span>
                                    <span className="text-xs text-gray-500 ml-2">
                                      ({room.occupantsActuels}/{room.capaciteTotale})
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Secteur</Label>
                          <Input
                            placeholder="Entrer le secteur"
                            value={roomAssignments[worker.workerId]?.secteur || ''}
                            onChange={(e) => handleUpdateRoomAssignment(worker.workerId, 'secteur', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <Label>Raison du rejet (si applicable)</Label>
                <Textarea
                  placeholder="Expliquez pourquoi vous rejetez ce transfert..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmDialog(false)}
                  disabled={loading}
                >
                  Annuler
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRejectTransfer}
                  disabled={loading}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Rejeter
                </Button>
                <Button
                  onClick={handleConfirmTransfer}
                  disabled={loading || !validateAssignments()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Confirmer le transfert
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
