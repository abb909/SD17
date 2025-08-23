import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Users, AlertCircle, Building, UserCheck } from 'lucide-react';
import SupervisorManagement from '@/components/SupervisorManagement';

export default function AdminSupervisorManagement() {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();

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
              <Users className="mr-3 h-8 w-8" />
              Gestion des superviseurs
            </h1>
            <p className="text-gray-600 mt-2">
              Gérer les superviseurs et leurs assignations
            </p>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Users className="mr-2 h-5 w-5 text-blue-600" />
              Superviseurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 mb-2">
              Actifs
            </div>
            <p className="text-sm text-gray-600">
              Superviseurs disponibles pour assignation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Building className="mr-2 h-5 w-5 text-green-600" />
              Entreprises
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 mb-2">
              Variées
            </div>
            <p className="text-sm text-gray-600">
              Différentes entreprises représentées
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <UserCheck className="mr-2 h-5 w-5 text-purple-600" />
              Assignations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 mb-2">
              En cours
            </div>
            <p className="text-sm text-gray-600">
              Superviseurs assignés aux ouvriers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Information Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Gestion des superviseurs:</strong> Ajoutez, modifiez et organisez les superviseurs 
          qui peuvent être assignés aux ouvriers. Vous pouvez les organiser par entreprise ou secteur d'activité.
        </AlertDescription>
      </Alert>

      {/* Main Supervisor Management Component */}
      <SupervisorManagement />

      {/* Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertCircle className="mr-2 h-5 w-5" />
            Guide des superviseurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Création de superviseurs</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Ajoutez les informations de contact complètes</li>
                <li>• Organisez par entreprise pour une meilleure gestion</li>
                <li>• Activez/désactivez selon les besoins</li>
                <li>• Utilisez des noms clairs et identifiables</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Assignation aux ouvriers</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Les superviseurs actifs apparaissent dans les formulaires d'ouvriers</li>
                <li>• Permet un suivi structuré des équipes</li>
                <li>• Facilite la communication et l'organisation</li>
                <li>• Améliore la traçabilité des responsabilités</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
