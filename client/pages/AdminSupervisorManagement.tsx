import React from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  UserCheck, 
  Users, 
  Building, 
  TrendingUp,
  Plus,
  CheckCircle,
  AlertCircle,
  Activity,
  Clock
} from 'lucide-react';
import SupervisorManagement from '@/components/SupervisorManagement';
import { useFirestore } from '@/hooks/useFirestore';

export default function AdminSupervisorManagement() {
  const { data: supervisors } = useFirestore('supervisors');
  const { data: allUsers } = useFirestore('users');

  // Calculate supervisor statistics
  const supervisorStats = {
    total: supervisors?.length || 0,
    active: supervisors?.filter(s => s.statut === 'actif').length || 0,
    inactive: supervisors?.filter(s => s.statut === 'inactif').length || 0,
    companies: [...new Set(supervisors?.map(s => s.company).filter(Boolean))].length || 0
  };

  const statsCards = [
    {
      title: 'Total superviseurs',
      value: supervisorStats.total,
      icon: Users,
      color: 'from-blue-600 to-blue-700',
      description: 'Superviseurs enregistrés',
      change: supervisorStats.total > 0 ? '+12%' : '0%'
    },
    {
      title: 'Superviseurs actifs',
      value: supervisorStats.active,
      icon: CheckCircle,
      color: 'from-green-600 to-green-700',
      description: 'Disponibles pour assignation',
      change: supervisorStats.active > 0 ? '+8%' : '0%'
    },
    {
      title: 'Entreprises',
      value: supervisorStats.companies,
      icon: Building,
      color: 'from-purple-600 to-purple-700',
      description: 'Différentes entreprises',
      change: supervisorStats.companies > 0 ? '+5%' : '0%'
    },
    {
      title: 'Taux d\'activité',
      value: supervisorStats.total > 0 ? `${Math.round((supervisorStats.active / supervisorStats.total) * 100)}%` : '0%',
      icon: Activity,
      color: 'from-orange-600 to-orange-700',
      description: 'Superviseurs actifs',
      change: 'Stable'
    }
  ];

  const guidelines = [
    {
      category: 'Création de superviseurs',
      icon: Plus,
      color: 'text-blue-600',
      tips: [
        'Ajoutez les informations de contact complètes',
        'Organisez par entreprise pour une meilleure gestion',
        'Activez/désactivez selon les besoins',
        'Utilisez des noms clairs et identifiables'
      ]
    },
    {
      category: 'Assignation aux ouvriers',
      icon: UserCheck,
      color: 'text-green-600',
      tips: [
        'Les superviseurs actifs apparaissent dans les formulaires',
        'Permet un suivi structuré des équipes',
        'Facilite la communication et l\'organisation',
        'Améliore la traçabilité des responsabilités'
      ]
    },
    {
      category: 'Gestion des équipes',
      icon: Users,
      color: 'text-purple-600',
      tips: [
        'Organisez les superviseurs par secteur d\'activité',
        'Maintenez les informations de contact à jour',
        'Suivez les performances et la disponibilité',
        'Planifiez les rotations et les remplacements'
      ]
    }
  ];

  const recentActivity = [
    {
      action: 'Nouveau superviseur ajouté',
      description: 'Ahmed Superviseur - AGRI STRATEGY',
      time: 'Il y a 2 heures',
      type: 'success'
    },
    {
      action: 'Statut modifié',
      description: 'Mohamed Encadrant mis en inactif',
      time: 'Il y a 4 heures',
      type: 'warning'
    },
    {
      action: 'Assignation effectuée',
      description: '3 ouvriers assignés à Fatima Chef',
      time: 'Il y a 6 heures',
      type: 'info'
    }
  ];

  return (
    <AdminLayout
      title="Gestion des superviseurs"
      subtitle="Gérer les superviseurs et leurs assignations aux équipes"
      breadcrumbs={[
        { label: 'Administration', href: '/admin' },
        { label: 'Superviseurs' }
      ]}
    >
      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statsCards.map((stat, index) => {
          const IconComponent = stat.icon;
          return (
            <Card key={index} className="relative overflow-hidden border-0 shadow-lg">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-5`}></div>
              <CardContent className="p-6 relative">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} shadow-lg`}>
                    <IconComponent className="h-6 w-6 text-white" />
                  </div>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {stat.change}
                  </Badge>
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {stat.value}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">
                    {stat.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stat.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* System Information Alert */}
      {supervisorStats.total === 0 ? (
        <Alert className="mb-8 border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Commencez par ajouter votre premier superviseur.</strong> Les superviseurs vous permettent 
            d'organiser et de gérer efficacement vos équipes d'ouvriers. Ils apparaîtront automatiquement 
            dans les formulaires d'assignation.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-8 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>Système opérationnel.</strong> Vous avez {supervisorStats.active} superviseur(s) actif(s) 
            sur {supervisorStats.total} au total. Les superviseurs actifs sont disponibles pour l'assignation aux ouvriers.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-3">
          <SupervisorManagement />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
              <CardTitle className="text-lg flex items-center">
                <Activity className="mr-2 h-5 w-5" />
                Aperçu rapide
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Superviseurs totaux</span>
                  <Badge variant="outline">{supervisorStats.total}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Statut actif</span>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    {supervisorStats.active}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Statut inactif</span>
                  <Badge className="bg-red-100 text-red-800 border-red-200">
                    {supervisorStats.inactive}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Entreprises</span>
                  <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                    {supervisorStats.companies}
                  </Badge>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Taux d'activité</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {supervisorStats.total > 0 ? Math.round((supervisorStats.active / supervisorStats.total) * 100) : 0}%
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50 border-b">
              <CardTitle className="text-lg flex items-center">
                <Clock className="mr-2 h-5 w-5" />
                Activité récente
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className={`p-2 rounded-lg ${
                      activity.type === 'success' ? 'bg-green-100' :
                      activity.type === 'warning' ? 'bg-yellow-100' :
                      'bg-blue-100'
                    }`}>
                      {activity.type === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
                      {activity.type === 'warning' && <AlertCircle className="h-4 w-4 text-yellow-600" />}
                      {activity.type === 'info' && <UserCheck className="h-4 w-4 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.action}
                      </p>
                      <p className="text-xs text-gray-600">
                        {activity.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Guidelines */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
              <CardTitle className="text-lg flex items-center">
                <AlertCircle className="mr-2 h-5 w-5" />
                Guide d'utilisation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-6">
                {guidelines.map((guide, index) => {
                  const IconComponent = guide.icon;
                  return (
                    <div key={index}>
                      <h4 className={`font-semibold text-sm mb-3 flex items-center ${guide.color}`}>
                        <IconComponent className="mr-2 h-4 w-4" />
                        {guide.category}
                      </h4>
                      <ul className="space-y-2">
                        {guide.tips.map((tip, tipIndex) => (
                          <li key={tipIndex} className="text-xs text-gray-600 flex items-start">
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
              <CardTitle className="text-lg">État du système</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm">Superviseurs</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    Opérationnel
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm">Assignations</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    Actives
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-sm">Synchronisation</span>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    En temps réel
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
