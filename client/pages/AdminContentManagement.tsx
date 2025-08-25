import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
import { ArrowLeft, Database, Plus, Package, AlertCircle } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ArticleNamesManagement from '@/components/ArticleNamesManagement';
import SupervisorManagement from '@/components/SupervisorManagement';
import { useToast } from '@/hooks/use-toast';
import { createSampleArticles } from '@/utils/createSampleArticles';

export default function AdminContentManagement() {
  const { user, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [isFloatingAddArticleOpen, setIsFloatingAddArticleOpen] = useState(false);

  const [articleForm, setArticleForm] = useState({
    name: '',
    defaultUnit: 'pièces',
    description: ''
  });

  const UNITS = [
    'pièces',
    'kg',
    'litres',
    'mètres',
    'boîtes',
    'paquets',
    'tubes',
    'bouteilles',
    'cartons',
    'sacs'
  ];

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

  const handleAddArticle = async () => {
    try {
      if (!articleForm.name.trim()) {
        toast({
          title: "Erreur",
          description: "Le nom de l'article est obligatoire",
          variant: "destructive"
        });
        return;
      }

      const newArticleName = {
        name: articleForm.name.trim(),
        defaultUnit: articleForm.defaultUnit,
        description: articleForm.description.trim() || null,
        isActive: true,
        createdBy: user?.uid || '',
        createdByName: user?.nom || user?.email || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'article_names'), newArticleName);

      setArticleForm({
        name: '',
        defaultUnit: 'pi��ces',
        description: ''
      });
      setIsFloatingAddArticleOpen(false);

      toast({
        title: "Succès",
        description: "Article ajouté avec succès"
      });
    } catch (error) {
      console.error('Error adding article:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter l'article",
        variant: "destructive"
      });
    }
  };

  const handleCreateSampleArticles = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const result = await createSampleArticles();
      if (result.success) {
        toast({
          title: "Succès",
          description: result.message,
          variant: "default"
        });
      } else {
        toast({
          title: "Erreur",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error creating sample articles:', error);
      toast({
        title: "Erreur",
        description: "Erreur lors de la création des articles d'exemple",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
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
              <Database className="mr-3 h-8 w-8" />
              Gestion du contenu
            </h1>
            <p className="text-gray-600 mt-2">
              Articles, superviseurs et données de référence
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Plus className="mr-2 h-5 w-5 text-blue-600" />
              Nouvel article
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Ajoutez un nouvel article personnalisé.
            </p>
            <Dialog open={isFloatingAddArticleOpen} onOpenChange={setIsFloatingAddArticleOpen}>
              <DialogTrigger asChild>
                <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600">
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter un article
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-lg mx-2 sm:mx-auto mobile-dialog-container">
                <DialogHeader className="mobile-dialog-header">
                  <DialogTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-600" />
                    Ajouter un Article
                  </DialogTitle>
                  <DialogDescription>
                    Créez un nouveau type d'article pour le système de stock
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="articleName">Nom de l'article *</Label>
                    <Input
                      id="articleName"
                      placeholder="EX: EPONGE"
                      value={articleForm.name}
                      onChange={(e) => setArticleForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultUnit">Unité par défaut</Label>
                    <Select
                      value={articleForm.defaultUnit}
                      onValueChange={(value) => setArticleForm(prev => ({ ...prev, defaultUnit: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(unit => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optionnel)</Label>
                    <Input
                      id="description"
                      placeholder="Description de l'article"
                      value={articleForm.description}
                      onChange={(e) => setArticleForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsFloatingAddArticleOpen(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleAddArticle}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <AlertCircle className="mr-2 h-5 w-5 text-orange-600" />
              Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Gérez les données de référence utilisées dans tout le système.
            </p>
            <div className="space-y-2">
              <div className="flex items-center text-xs text-gray-500">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                Articles disponibles pour le stock
              </div>
              <div className="flex items-center text-xs text-gray-500">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                Superviseurs pour l'assignation
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Article Names Management Section */}
      <ArticleNamesManagement />

      {/* Supervisor Management Section */}
      <SupervisorManagement />

      {/* Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertCircle className="mr-2 h-5 w-5" />
            Guide d'utilisation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Articles</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Les articles définissent les types d'éléments disponibles dans le stock</li>
                <li>• Chaque article a une unité par défaut (pièces, kg, litres, etc.)</li>
                <li>• Les articles peuvent être activés/désactivés selon les besoins</li>
                <li>• Utilisez les articles d'exemple pour commencer rapidement</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Superviseurs</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Les superviseurs peuvent être assignés aux ouvriers</li>
                <li>• Organisez par entreprise ou par secteur d'activité</li>
                <li>• Les superviseurs actifs sont disponibles dans les formulaires</li>
                <li>• Gérez les informations de contact de chaque superviseur</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
