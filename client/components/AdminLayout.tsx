import React, { ReactNode, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Settings,
  Users,
  Database,
  Shield,
  Wrench,
  ChevronRight,
  ArrowLeft,
  Home,
  UserCheck,
  LogOut,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminErrorBoundary } from '@/components/AdminErrorBoundary';
import { AdminPageLoading } from '@/components/AdminLoadingStates';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export const AdminLayout = ({ 
  children, 
  title, 
  subtitle, 
  showBackButton = true,
  breadcrumbs 
}: AdminLayoutProps) => {
  const { user, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if not super admin
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Accès non autorisé
          </h2>
          <p className="text-gray-600 mb-6">
            Seuls les super administrateurs peuvent accéder à cette section.
          </p>
          <Button onClick={() => navigate('/')} className="w-full">
            <Home className="mr-2 h-4 w-4" />
            Retour à l'accueil
          </Button>
        </Card>
      </div>
    );
  }

  const adminNavigation = [
    {
      name: 'Tableau de bord',
      href: '/admin',
      icon: Settings,
      description: 'Vue d\'ensemble de l\'administration'
    },
    {
      name: 'Utilisateurs',
      href: '/admin/users',
      icon: Users,
      description: 'Gestion des comptes utilisateurs'
    },
    {
      name: 'Superviseurs',
      href: '/admin/supervisors',
      icon: UserCheck,
      description: 'Gestion des superviseurs'
    },
    {
      name: 'Contenu',
      href: '/admin/content',
      icon: Database,
      description: 'Articles et données de référence'
    },
    {
      name: 'Sécurité',
      href: '/admin/security',
      icon: Shield,
      description: 'Codes de sécurité et permissions'
    },
    {
      name: 'Outils système',
      href: '/admin/system',
      icon: Wrench,
      description: 'Maintenance et synchronisation'
    }
  ];

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'superadmin': return 'Super Administrateur';
      case 'admin': return 'Administrateur';
      case 'user': return 'Utilisateur';
      default: return role;
    }
  };

  const generateBreadcrumbs = () => {
    if (breadcrumbs) return breadcrumbs;
    
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const items = [{ label: 'Administration', href: '/admin' }];
    
    if (pathSegments.length > 1) {
      const page = pathSegments[pathSegments.length - 1];
      const pageLabels: { [key: string]: string } = {
        'users': 'Utilisateurs',
        'supervisors': 'Superviseurs',
        'content': 'Contenu',
        'security': 'Sécurité',
        'system': 'Outils système'
      };
      
      if (pageLabels[page]) {
        items.push({ label: pageLabels[page] });
      }
    }
    
    return items;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            {/* Left side */}
            <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
              {showBackButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/admin')}
                  className="hover:bg-gray-100 flex-shrink-0 min-h-[44px] px-2 sm:px-3"
                >
                  <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Administration</span>
                  <span className="xs:hidden">Admin</span>
                </Button>
              )}
              <div className="hidden sm:block flex-shrink-0">
                <div className="p-1.5 sm:p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
                  <Settings className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-lg font-bold text-gray-900 truncate">
                  Centre d'Administration
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 hidden sm:block truncate">
                  Gestion système et configuration
                </p>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <nav className="flex space-x-2 sm:space-x-4 lg:space-x-8 overflow-x-auto py-3 sm:py-4 scrollbar-hide">
            {adminNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <button
                  key={item.name}
                  onClick={() => navigate(item.href)}
                  className={cn(
                    'flex items-center px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap min-w-fit min-h-[44px] touch-manipulation',
                    isActive
                      ? 'bg-blue-100 text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                  )}
                >
                  <item.icon className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden xs:inline sm:inline">
                    {item.name}
                  </span>
                  <span className="xs:hidden sm:hidden">
                    {item.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem />
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg">
              {adminNavigation.find(item => location.pathname === item.href)?.icon && (
                React.createElement(
                  adminNavigation.find(item => location.pathname === item.href)!.icon,
                  { className: "h-6 w-6 text-white" }
                )
              )}
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {title}
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="space-y-6">
          <AdminErrorBoundary>
            <Suspense fallback={<AdminPageLoading title={title} />}>
              {children}
            </Suspense>
          </AdminErrorBoundary>
        </div>
      </main>
    </div>
  );
};
