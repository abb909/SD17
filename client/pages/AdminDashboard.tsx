import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFirestore } from '@/hooks/useFirestore';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Users, Settings, Shield, Database, Wrench } from 'lucide-react';

export default function AdminDashboard() {
  const { user, isSuperAdmin } = useAuth();
  const { data: allUsers } = useFirestore('users');
  const { data: fermes } = useFirestore('fermes');
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
              <p className="text-gray-600 mb-4">
                Seuls les super administrateurs peuvent accéder à cette page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'superadmin': return 'Super Admin';
      case 'admin': return 'Administrateur';
      case 'user': return 'Utilisateur';
      default: return role;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'superadmin': return 'bg-red-100 text-red-800';
      case 'admin': return 'bg-blue-100 text-blue-800';
      case 'user': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const navigationCards = [
    {
      title: 'Gestion des utilisateurs',
      description: 'Créer, modifier et gérer les comptes utilisateurs',
      icon: Users,
      path: '/admin/users',
      color: 'from-blue-600 to-indigo-600',
      stats: `${allUsers?.length || 0} utilisateurs`
    },
    {
      title: 'Gestion du contenu',
      description: 'Articles et données de référence',
      icon: Database,
      path: '/admin/content',
      color: 'from-green-600 to-emerald-600',
      stats: `${fermes?.length || 0} fermes`
    },
    {
      title: 'Gestion des superviseurs',
      description: 'Superviseurs et leurs assignations',
      icon: Users,
      path: '/admin/supervisors',
      color: 'from-purple-600 to-violet-600',
      stats: 'Superviseurs'
    },
    {
      title: 'Outils système',
      description: 'Synchronisation et outils de débogage',
      icon: Wrench,
      path: '/admin/system',
      color: 'from-orange-600 to-amber-600',
      stats: 'Maintenance'
    },
    {
      title: 'Centre de sécurité',
      description: 'Codes de sécurité et gestion des administrateurs',
      icon: Shield,
      path: '/admin/security',
      color: 'from-red-600 to-rose-600',
      stats: 'Sécurité'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <Settings className="mr-3 h-8 w-8" />
          Administration
        </h1>
        <p className="text-gray-600 mt-2">
          Tableau de bord d'administration système
        </p>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total utilisateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {allUsers?.length || 0}
            </div>
            <div className="flex space-x-2 mt-2">
              <Badge className="bg-red-100 text-red-800 text-xs">
                {allUsers?.filter(u => u.role === 'superadmin').length || 0} Super admins
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 text-xs">
                {allUsers?.filter(u => u.role === 'admin').length || 0} Admins
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Fermes actives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {fermes?.length || 0}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Fermes configurées dans le système
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Statut système
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-green-100 text-green-800">
              ✅ Opérationnel
            </Badge>
            <p className="text-xs text-gray-500 mt-2">
              Tous les services fonctionnent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Connecté en tant que
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={getRoleBadgeColor(user?.role || '')}>
              {getRoleLabel(user?.role || '')}
            </Badge>
            <p className="text-xs text-gray-500 mt-2">
              {user?.nom || user?.email}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {navigationCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <Card 
              key={card.path}
              className="cursor-pointer hover:shadow-lg transition-shadow duration-200 group"
              onClick={() => navigate(card.path)}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-lg bg-gradient-to-r ${card.color} text-white group-hover:scale-110 transition-transform duration-200`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {card.stats}
                  </Badge>
                </div>
                <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm">
                  {card.description}
                </p>
                <div className="mt-4 text-blue-600 text-sm font-medium group-hover:text-blue-700">
                  Accéder →
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="mr-2 h-5 w-5" />
            Actions rapides
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate('/admin/users')}
            >
              <Users className="h-5 w-5 text-blue-600 mb-2" />
              <h4 className="font-medium mb-1">Nouvel utilisateur</h4>
              <p className="text-sm text-gray-600">Créer un compte utilisateur</p>
            </div>
            
            <div 
              className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate('/admin/security')}
            >
              <Shield className="h-5 w-5 text-red-600 mb-2" />
              <h4 className="font-medium mb-1">Code de sécurité</h4>
              <p className="text-sm text-gray-600">Générer un code de suppression</p>
            </div>
            
            <div 
              className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate('/admin/system')}
            >
              <Wrench className="h-5 w-5 text-orange-600 mb-2" />
              <h4 className="font-medium mb-1">Sync chambres</h4>
              <p className="text-sm text-gray-600">Synchroniser l'occupation</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
