import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import WorkerTransferNotifications from '@/components/WorkerTransferNotifications';
import WorkerTransferStatus from '@/components/WorkerTransferStatus';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Send,
  Inbox,
  ArrowRightLeft,
  Users
} from 'lucide-react';

export default function Transfers() {
  const { user, isSuperAdmin, isAdmin } = useAuth();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <ArrowRightLeft className="mr-3 h-8 w-8 text-blue-600" />
            Transferts d'Ouvriers
          </h1>
          <p className="text-gray-600 mt-2">
            Gérez les transferts d'ouvriers entrants et sortants
          </p>
        </div>
      </div>

      {/* Transfer Management Tabs */}
      <Tabs defaultValue="incoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="incoming" className="flex items-center space-x-2">
            <Inbox className="h-4 w-4" />
            <span>Transferts entrants</span>
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="flex items-center space-x-2">
            <Send className="h-4 w-4" />
            <span>Transferts envoyés</span>
          </TabsTrigger>
        </TabsList>

        {/* Incoming Transfers Tab */}
        <TabsContent value="incoming" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Inbox className="mr-2 h-5 w-5 text-green-600" />
                Transferts d'ouvriers entrants
              </CardTitle>
              <p className="text-sm text-gray-600">
                Confirmez ou rejetez les demandes de transfert d'ouvriers vers votre ferme
              </p>
            </CardHeader>
            <CardContent>
              <WorkerTransferNotifications />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Outgoing Transfers Tab */}
        <TabsContent value="outgoing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Send className="mr-2 h-5 w-5 text-blue-600" />
                Transferts d'ouvriers envoyés
              </CardTitle>
              <p className="text-sm text-gray-600">
                Suivez le statut des transferts d'ouvriers que vous avez initiés
              </p>
            </CardHeader>
            <CardContent>
              <WorkerTransferStatus />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Help Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-800 flex items-center">
            <Users className="mr-2 h-5 w-5" />
            Comment fonctionnent les transferts ?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-blue-700 space-y-2">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Transferts entrants :</h4>
              <ul className="text-sm space-y-1">
                <li>• Recevez des notifications de transfert</li>
                <li>• Assignez secteurs et chambres</li>
                <li>• Confirmez ou rejetez les demandes</li>
                <li>• L'historique des ouvriers est préservé</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Transferts envoyés :</h4>
              <ul className="text-sm space-y-1">
                <li>• Suivez le statut de vos demandes</li>
                <li>• Annulez les transferts en attente</li>
                <li>• Recevez des confirmations automatiques</li>
                <li>• Consultez les détails d'assignation</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
