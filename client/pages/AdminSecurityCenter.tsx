import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFirestore } from '@/hooks/useFirestore';
import { useNotifications } from '@/contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Shield, Key, Package, AlertCircle, X } from 'lucide-react';
import { addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function AdminSecurityCenter() {
  const { user, isSuperAdmin } = useAuth();
  const { data: fermes } = useFirestore('fermes');
  const { sendNotification } = useNotifications();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedCodeForSharing, setSelectedCodeForSharing] = useState<string | null>(null);
  const [shareSelectedFarm, setShareSelectedFarm] = useState('');
  const [maxDeletions, setMaxDeletions] = useState<number>(10);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  // Expiration period settings
  const [expirationValue, setExpirationValue] = useState<number>(24);
  const [expirationUnit, setExpirationUnit] = useState<'hours' | 'days' | 'weeks' | 'months'>('hours');

  // Security code management states
  const [securityCodeInfo, setSecurityCodeInfo] = useState<{
    code: string;
    expiresAt: Date;
    codeId: string;
    maxDeletions: number;
  } | null>(null);
  const [activeCodesInfo, setActiveCodesInfo] = useState<{
    id: string;
    code: string;
    expiresAt: Date;
    usageCount: number;
    createdAt: Date;
    isUsed: boolean;
    sharedWith: string[];
    maxDeletions: number;
    deletionsUsed: number;
  }[] | null>(null);

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Accès non autorisé
              </h3>
              <p className="text-gray-600">
                Seuls les super administrateurs peuvent accéder à cette page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const generateSecurityCode = async () => {
    setLoading(true);
    try {
      // Generate a 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Set expiration based on selected period
      const expiresAt = new Date();
      switch (expirationUnit) {
        case 'hours':
          expiresAt.setHours(expiresAt.getHours() + expirationValue);
          break;
        case 'days':
          expiresAt.setDate(expiresAt.getDate() + expirationValue);
          break;
        case 'weeks':
          expiresAt.setDate(expiresAt.getDate() + (expirationValue * 7));
          break;
        case 'months':
          expiresAt.setMonth(expiresAt.getMonth() + expirationValue);
          break;
      }

      // Store the code in Firestore
      const codeData = {
        code,
        createdAt: serverTimestamp(),
        expiresAt,
        createdBy: user?.uid,
        createdByEmail: user?.email,
        isActive: true,
        usageCount: 0,
        isUsed: false,
        sharedWith: [],
        maxDeletions,
        deletionsUsed: 0,
        expirationValue,
        expirationUnit,
        expirationDescription: `${expirationValue} ${expirationUnit === 'hours' ? 'heure(s)' :
          expirationUnit === 'days' ? 'jour(s)' :
          expirationUnit === 'weeks' ? 'semaine(s)' : 'mois'}`
      };

      const docRef = await addDoc(collection(db, 'bulkDeletionCodes'), codeData);

      const expirationDescription = `${expirationValue} ${expirationUnit === 'hours' ? 'heure(s)' :
        expirationUnit === 'days' ? 'jour(s)' :
        expirationUnit === 'weeks' ? 'semaine(s)' : 'mois'}`;

      setSecurityCodeInfo({ code, expiresAt, codeId: docRef.id, maxDeletions });
      setMessage(`Code de sécurité généré: ${code}\nDurée de validité: ${expirationDescription}\nValide jusqu'à: ${expiresAt.toLocaleString('fr-FR')}\nLimite de suppression: ${maxDeletions} ouvrier(s)`);
      setActiveCodesInfo(null); // Clear active codes display
      setShowGenerateDialog(false);

    } catch (error: any) {
      console.error('Error generating security code:', error);
      setError(`Erreur lors de la génération du code: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const viewActiveCodes = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'bulkDeletionCodes'),
        where('isActive', '==', true)
      );

      const querySnapshot = await getDocs(q);
      const now = new Date();

      // Filter expired codes and sort on client side
      const codes = querySnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            code: data.code,
            expiresAt: data.expiresAt.toDate(),
            usageCount: data.usageCount || 0,
            createdAt: data.createdAt?.toDate() || new Date(),
            isUsed: data.isUsed || false,
            sharedWith: data.sharedWith || [],
            maxDeletions: data.maxDeletions || 1,
            deletionsUsed: data.deletionsUsed || 0
          };
        })
        .filter(code => code.expiresAt > now && !code.isUsed)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setActiveCodesInfo(codes);
      setSecurityCodeInfo(null);

      if (codes.length === 0) {
        setMessage('Aucun code actif trouvé.');
      }

    } catch (error: any) {
      console.error('Error fetching active codes:', error);
      setError(`Erreur lors de la récupération des codes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const shareCodeWithFarm = async (codeId: string, fermeId: string) => {
    setLoading(true);
    try {
      const selectedFarm = fermes?.find(f => f.id === fermeId);
      if (!selectedFarm) {
        setError('Ferme sélectionnée non trouvée');
        return;
      }

      // Get farm admin
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const farmAdmin = usersSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(userData =>
          userData.role === 'admin' &&
          userData.fermeId === fermeId
        );

      if (!farmAdmin) {
        setError(`Aucun administrateur trouvé pour la ferme ${selectedFarm.nom}`);
        return;
      }

      // Get the code details
      const codeDoc = await getDocs(collection(db, 'bulkDeletionCodes'));
      const codeData = codeDoc.docs.find(doc => doc.id === codeId)?.data();

      if (!codeData) {
        setError('Code de sécurité non trouvé');
        return;
      }

      // Update code to track sharing
      const { updateDoc, doc: docRef } = await import('firebase/firestore');
      await updateDoc(docRef(db, 'bulkDeletionCodes', codeId), {
        sharedWith: [...(codeData.sharedWith || []), fermeId],
        lastSharedAt: serverTimestamp()
      });

      // Send notification to farm admin
      await sendNotification({
        type: 'security_code_shared',
        title: '🔐 Code de sécurité reçu',
        message: `Vous avez reçu un code de sécurité pour la suppression en masse. Code: ${codeData.code}. Valable jusqu'à ${codeData.expiresAt.toDate().toLocaleString('fr-FR')}. ATTENTION: Ce code n'est valable que pour UN SEUL usage.`,
        recipientId: farmAdmin.id,
        recipientFermeId: fermeId,
        status: 'unread',
        priority: 'high',
        createdBy: user?.uid,
        createdByName: user?.nom || user?.email || 'Super Administrateur',
        actionData: {
          code: codeData.code,
          expiresAt: codeData.expiresAt.toDate().toISOString(),
          actionRequired: 'Code de sécurité pour suppression en masse',
          actionUrl: '/workers'
        }
      });

      setMessage(`Code partagé avec succès avec ${selectedFarm.nom} (Administrateur: ${farmAdmin.nom || farmAdmin.email})`);
      setShowShareDialog(false);
      setSelectedCodeForSharing(null);
      setShareSelectedFarm('');

      // Refresh active codes to show updated sharing status
      await viewActiveCodes();

    } catch (error: any) {
      console.error('Error sharing security code:', error);
      setError(`Erreur lors du partage: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShareCode = (codeId: string) => {
    setSelectedCodeForSharing(codeId);
    setShowShareDialog(true);
  };

  const deactivateCode = async (codeId: string) => {
    try {
      const { updateDoc, doc: docRef } = await import('firebase/firestore');
      await updateDoc(docRef(db, 'bulkDeletionCodes', codeId), {
        isActive: false,
        deactivatedAt: serverTimestamp(),
        deactivatedBy: user?.uid
      });

      setMessage('Code désactivé avec succès');
      await viewActiveCodes(); // Refresh the list
    } catch (error: any) {
      console.error('Error deactivating code:', error);
      setError(`Erreur lors de la désactivation: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate('/admin')}
            className="flex items-center"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <Shield className="mr-3 h-8 w-8" />
              Centre de sécurité
            </h1>
            <p className="text-gray-600 mt-2">
              Codes de sécurité et gestion des administrateurs
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Key className="mr-2 h-5 w-5 text-indigo-600" />
              Actions rapides
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
              <DialogTrigger asChild>
                <Button
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600"
                >
                  <Key className="mr-2 h-4 w-4" />
                  Générer un nouveau code
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-md mx-2 sm:mx-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <Key className="mr-2 h-5 w-5 text-indigo-600" />
                    Générer un code de sécurité
                  </DialogTitle>
                  <DialogDescription>
                    Définissez la limite de suppression pour ce code de sécurité.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxDeletions">Nombre maximum de suppressions</Label>
                    <Input
                      id="maxDeletions"
                      type="number"
                      min="1"
                      max="1000"
                      value={maxDeletions}
                      onChange={(e) => setMaxDeletions(parseInt(e.target.value) || 1)}
                      placeholder="10"
                    />
                    <p className="text-xs text-gray-500">
                      Ce code pourra supprimer au maximum {maxDeletions} ouvrier(s)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Période d'expiration</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          value={expirationValue}
                          onChange={(e) => setExpirationValue(parseInt(e.target.value) || 1)}
                          placeholder="24"
                        />
                      </div>
                      <div>
                        <Select
                          value={expirationUnit}
                          onValueChange={(value: 'hours' | 'days' | 'weeks' | 'months') => setExpirationUnit(value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours">Heure(s)</SelectItem>
                            <SelectItem value="days">Jour(s)</SelectItem>
                            <SelectItem value="weeks">Semaine(s)</SelectItem>
                            <SelectItem value="months">Mois</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Le code expirera dans {expirationValue} {expirationUnit === 'hours' ? 'heure(s)' :
                        expirationUnit === 'days' ? 'jour(s)' :
                        expirationUnit === 'weeks' ? 'semaine(s)' : 'mois'}
                    </p>
                  </div>
                  <Alert className="border-orange-200 bg-orange-50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-orange-800 text-sm">
                      <strong>Important:</strong> Cette limite ne peut pas être modifiée après la création du code.
                    </AlertDescription>
                  </Alert>
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowGenerateDialog(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={generateSecurityCode}
                      disabled={loading || maxDeletions < 1}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      {loading ? 'Génération...' : 'Générer le code'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              onClick={viewActiveCodes}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              <Shield className="mr-2 h-4 w-4" />
              Voir les codes actifs
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-orange-600" />
              Informations importantes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-gray-600 space-y-2">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                <span>Les codes ne peuvent être utilisés qu'une seule fois</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
                <span>Durée de validité: Configurable (heures, jours, semaines, mois)</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                <span>Limite de suppression configurable</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span>Partage sécurisé par notification</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security Code Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="mr-2 h-5 w-5" />
            Gestion des codes de sécurité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Générez des codes de sécurité temporaires pour autoriser les administrateurs de ferme à effectuer des suppressions en masse d'ouvriers.
              </AlertDescription>
            </Alert>

            {securityCodeInfo && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-mono text-lg font-bold mb-2">
                        Code généré: {securityCodeInfo.code}
                      </div>
                      <div className="text-sm">
                        Valide jusqu'à: {securityCodeInfo.expiresAt.toLocaleString('fr-FR')}
                      </div>
                      <div className="text-sm mt-1 text-blue-700">
                        Limite de suppression: {securityCodeInfo.maxDeletions} ouvrier(s)
                      </div>
                      <div className="text-xs mt-1 text-green-600">
                        ATTENTION: Ce code n'est valable que pour UN SEUL usage.
                      </div>
                    </div>
                    <Button
                      onClick={() => handleShareCode(securityCodeInfo.codeId)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1"
                      size="sm"
                    >
                      <Package className="mr-1 h-3 w-3" />
                      Partager
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {activeCodesInfo && (
              <Alert className="border-blue-200 bg-blue-50">
                <AlertDescription className="text-blue-800">
                  <div className="font-semibold mb-3">Codes actifs ({activeCodesInfo.length}):</div>
                  {activeCodesInfo.length > 0 ? (
                    <div className="space-y-3">
                      {activeCodesInfo.map((codeInfo) => (
                        <div key={codeInfo.id} className="font-mono text-sm p-3 bg-white rounded border">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div>Code: <span className="font-bold text-lg">{codeInfo.code}</span></div>
                              <div className="text-xs text-gray-600 mt-1">
                                Créé: {codeInfo.createdAt.toLocaleString('fr-FR')}
                              </div>
                              <div className="text-xs text-gray-600">
                                Expire: {codeInfo.expiresAt.toLocaleString('fr-FR')}
                              </div>
                              <div className="text-xs text-blue-600 mt-1">
                                Limite: {codeInfo.deletionsUsed}/{codeInfo.maxDeletions} suppressions
                              </div>
                              {codeInfo.sharedWith.length > 0 && (
                                <div className="text-xs text-blue-600 mt-1">
                                  Partagé avec: {codeInfo.sharedWith.map(fermeId => {
                                    const farm = fermes?.find(f => f.id === fermeId);
                                    return farm?.nom || fermeId;
                                  }).join(', ')}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                onClick={() => handleShareCode(codeInfo.id)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1"
                                size="sm"
                              >
                                <Package className="mr-1 h-3 w-3" />
                                Partager
                              </Button>
                              <Button
                                onClick={() => deactivateCode(codeInfo.id)}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1"
                                size="sm"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className={codeInfo.isUsed ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                                {codeInfo.isUsed ? '🔴 Utilisé' : '🟢 Disponible'}
                              </span>
                              <span className="text-gray-500">
                                Utilisations: {codeInfo.usageCount || 0}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-600">Suppressions:</span>
                                <span className={codeInfo.deletionsUsed >= codeInfo.maxDeletions ? 'text-red-600 font-semibold' : 'text-blue-600'}>
                                  {codeInfo.deletionsUsed}/{codeInfo.maxDeletions}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    codeInfo.deletionsUsed >= codeInfo.maxDeletions
                                      ? 'bg-red-500'
                                      : codeInfo.deletionsUsed > codeInfo.maxDeletions * 0.8
                                        ? 'bg-orange-500'
                                        : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${Math.min((codeInfo.deletionsUsed / codeInfo.maxDeletions) * 100, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm">Aucun code actif disponible.</div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Key className="mr-2 h-5 w-5 text-indigo-600" />
              Codes générés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {securityCodeInfo ? '1' : '0'}
            </div>
            <p className="text-sm text-gray-500">Codes actifs aujourd'hui</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Package className="mr-2 h-5 w-5 text-blue-600" />
              Partages effectués
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {activeCodesInfo?.reduce((total, code) => total + code.sharedWith.length, 0) || 0}
            </div>
            <p className="text-sm text-gray-500">Codes partagés avec les fermes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Shield className="mr-2 h-5 w-5 text-green-600" />
              Sécurité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ✓
            </div>
            <p className="text-sm text-gray-500">Système sécurisé</p>
          </CardContent>
        </Card>
      </div>

      {/* Messages */}
      {message && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="text-green-800 whitespace-pre-line">
            {message}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Share Code Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="w-[95vw] max-w-md mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Package className="mr-2 h-5 w-5 text-blue-600" />
              Partager le code de sécurité
            </DialogTitle>
            <DialogDescription>
              Sélectionnez une ferme pour partager ce code avec son administrateur.
              Le code sera envoyé via notification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ferme destinataire</Label>
              <Select
                value={shareSelectedFarm}
                onValueChange={setShareSelectedFarm}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une ferme" />
                </SelectTrigger>
                <SelectContent>
                  {fermes?.map(ferme => (
                    <SelectItem key={ferme.id} value={ferme.id}>
                      {ferme.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Alert className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-orange-800 text-sm">
                <strong>Important:</strong> Ce code ne peut être utilisé qu'une seule fois.
                Une fois utilisé par l'administrateur de ferme, il deviendra invalide.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowShareDialog(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={() => {
                  if (selectedCodeForSharing && shareSelectedFarm) {
                    shareCodeWithFarm(selectedCodeForSharing, shareSelectedFarm);
                  }
                }}
                disabled={!shareSelectedFarm || loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? 'Partage en cours...' : 'Partager le code'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertCircle className="mr-2 h-5 w-5" />
            Guide de sécurité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Codes de sécurité</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Générés automatiquement avec 6 chiffres</li>
                <li>• Valides pendant 24 heures maximum</li>
                <li>• Usage unique - se désactivent après utilisation</li>
                <li>• Traçabilité complète des utilisations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Partage sécurisé</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Envoi automatique par notification</li>
                <li>• Ciblage précis des administrateurs de ferme</li>
                <li>• Historique des partages conservé</li>
                <li>• Possibilité de désactivation manuelle</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
