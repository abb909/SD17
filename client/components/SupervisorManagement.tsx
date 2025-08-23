import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFirestore } from '@/hooks/useFirestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, UserPlus, Edit, Trash2, AlertCircle, Phone } from 'lucide-react';
import { Supervisor } from '@shared/types';

export default function SupervisorManagement() {
  const { user, isSuperAdmin } = useAuth();
  const { data: allSupervisors, addDocument, updateDocument, deleteDocument } = useFirestore('supervisors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingSupervisor, setEditingSupervisor] = useState<Supervisor | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    nom: '',
    telephone: '',
    company: '',
    statut: 'actif' as 'actif' | 'inactif'
  });

  // Use all supervisors since they are now global
  const supervisors = allSupervisors || [];

  const resetForm = () => {
    setFormData({
      nom: '',
      telephone: '',
      company: '',
      statut: 'actif'
    });
    setEditingSupervisor(null);
    setError('');
    setMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      // Validate required fields
      if (!formData.nom || !formData.telephone) {
        setError('Veuillez remplir tous les champs obligatoires');
        return;
      }

      const supervisorData = {
        ...formData,
        updatedAt: new Date().toISOString()
      };

      if (editingSupervisor) {
        // Update existing supervisor
        await updateDocument(editingSupervisor.id, supervisorData);
        setMessage('Superviseur mis à jour avec succès');
      } else {
        // Add new supervisor
        await addDocument({
          ...supervisorData,
          createdAt: new Date().toISOString()
        });
        setMessage('Superviseur ajouté avec succès');
      }

      resetForm();
      setIsDialogOpen(false);
    } catch (err: any) {
      console.error('Error managing supervisor:', err);
      setError('Erreur lors de la gestion du superviseur: ' + (err.message || 'Erreur inconnue'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (supervisor: Supervisor) => {
    setFormData({
      nom: supervisor.nom,
      telephone: supervisor.telephone,
      company: supervisor.company || '',
      statut: supervisor.statut
    });
    setEditingSupervisor(supervisor);
    setIsDialogOpen(true);
  };

  const handleDelete = async (supervisor: Supervisor) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le superviseur "${supervisor.nom}" ?`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteDocument(supervisor.id);
      setMessage('Superviseur supprimé avec succès');
    } catch (err: any) {
      console.error('Error deleting supervisor:', err);
      setError('Erreur lors de la suppression: ' + (err.message || 'Erreur inconnue'));
    } finally {
      setLoading(false);
    }
  };



  const getStatusBadge = (statut: string) => {
    return (
      <Badge className={statut === 'actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
        {statut === 'actif' ? 'Actif' : 'Inactif'}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <User className="mr-2 h-5 w-5" />
            Gestion des Superviseurs
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600">
                <UserPlus className="mr-2 h-4 w-4" />
                Ajouter un superviseur
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-lg mx-2 sm:mx-auto mobile-dialog-container">
              <DialogHeader className="mobile-dialog-header">
                <DialogTitle>
                  {editingSupervisor ? 'Modifier le superviseur' : 'Ajouter un nouveau superviseur'}
                </DialogTitle>
                <DialogDescription>
                  {editingSupervisor 
                    ? 'Modifiez les informations du superviseur'
                    : 'Remplissez les informations du nouveau superviseur'
                  }
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mobile-dialog-content">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {message && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-green-700">{message}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="nom">Nom complet *</Label>
                  <Input
                    id="nom"
                    value={formData.nom}
                    onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
                    placeholder="Ex: Ahmed Superviseur"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telephone">
                    <Phone className="inline mr-1 h-4 w-4" />
                    Téléphone *
                  </Label>
                  <Input
                    id="telephone"
                    value={formData.telephone}
                    onChange={(e) => setFormData(prev => ({ ...prev, telephone: e.target.value }))}
                    placeholder="Ex: 0612345678"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">interime</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                    placeholder="Ex: AGRI STRATEGY"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="statut">Statut</Label>
                  <Select
                    value={formData.statut}
                    onValueChange={(value: 'actif' | 'inactif') => setFormData(prev => ({ ...prev, statut: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actif">Actif</SelectItem>
                      <SelectItem value="inactif">Inactif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Enregistrement...' : (editingSupervisor ? 'Modifier' : 'Ajouter')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {supervisors.length === 0 ? (
          <div className="text-center py-8">
            <User className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun superviseur</h3>
            <p className="text-gray-600 mb-4">
              Commencez par ajouter votre premier superviseur.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>interime</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supervisors.map((supervisor: Supervisor) => (
                  <TableRow key={supervisor.id}>
                    <TableCell className="font-medium">{supervisor.nom}</TableCell>
                    <TableCell className="text-slate-600">
                      {supervisor.company || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Phone className="mr-1 h-3 w-3" />
                        {supervisor.telephone}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(supervisor.statut)}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(supervisor)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(supervisor)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
