import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Megaphone, 
  Users, 
  Shield, 
  Globe, 
  Send, 
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';

export default function AnnouncementSystem() {
  const { broadcastAnnouncement } = useNotifications();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    targetAudience: 'all' as 'all' | 'users' | 'admins',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (!formData.title.trim() || !formData.message.trim()) {
        setError('Le titre et le message sont requis');
        return;
      }

      await broadcastAnnouncement(
        formData.title,
        formData.message,
        formData.targetAudience,
        formData.priority
      );

      setMessage('✅ Annonce envoyée avec succès à tous les utilisateurs ciblés!');
      setFormData({
        title: '',
        message: '',
        targetAudience: 'all',
        priority: 'medium'
      });
    } catch (err: any) {
      console.error('Error sending announcement:', err);
      setError('Erreur lors de l\'envoi de l\'annonce: ' + (err.message || 'Erreur inconnue'));
    } finally {
      setLoading(false);
    }
  };

  const getAudienceIcon = (audience: string) => {
    switch (audience) {
      case 'all': return <Globe className="h-4 w-4" />;
      case 'users': return <Users className="h-4 w-4" />;
      case 'admins': return <Shield className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };

  const getAudienceLabel = (audience: string) => {
    switch (audience) {
      case 'all': return 'Tous les utilisateurs';
      case 'users': return 'Utilisateurs seulement';
      case 'admins': return 'Administrateurs seulement';
      default: return 'Tous les utilisateurs';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low': return 'Faible';
      case 'medium': return 'Normale';
      case 'high': return 'Élevée';
      case 'urgent': return 'Urgente';
      default: return 'Normale';
    }
  };

  return (
    <Card className="bg-white/70 backdrop-blur-sm shadow-xl border-0 ring-1 ring-slate-200/50">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-slate-200/50">
        <CardTitle className="flex items-center text-xl font-semibold text-slate-900">
          <div className="bg-purple-100 p-2 rounded-lg mr-3">
            <Megaphone className="h-5 w-5 text-purple-600" />
          </div>
          Système d'Annonces
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-slate-700">
              Titre de l'annonce *
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Ex: Maintenance "
              required
              className="bg-white border-slate-300 focus:border-purple-500"
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message" className="text-sm font-medium text-slate-700">
              Message *
            </Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Rédigez votre message d'annonce ici..."
              required
              rows={4}
              className="bg-white border-slate-300 focus:border-purple-500"
            />
          </div>

          {/* Target Audience and Priority Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target Audience */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Public cible
              </Label>
              <Select
                value={formData.targetAudience}
                onValueChange={(value: 'all' | 'users' | 'admins') => 
                  setFormData(prev => ({ ...prev, targetAudience: value }))
                }
              >
                <SelectTrigger className="bg-white border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center space-x-2">
                      <Globe className="h-4 w-4 text-blue-600" />
                      <span>Tous les utilisateurs</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="users">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-green-600" />
                      <span>Utilisateurs seulement</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admins">
                    <div className="flex items-center space-x-2">
                      <Shield className="h-4 w-4 text-purple-600" />
                      <span>Administrateurs seulement</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Priorité
              </Label>
              <Select
                value={formData.priority}
                onValueChange={(value: 'low' | 'medium' | 'high' | 'urgent') => 
                  setFormData(prev => ({ ...prev, priority: value }))
                }
              >
                <SelectTrigger className="bg-white border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  
                  <SelectItem value="medium">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-blue-500" />
                      <span>Normale</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      <span>Élevée</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="urgent">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <span>Urgente</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {formData.title && formData.message && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-700">Aperçu de l'annonce</h4>
                <div className="flex items-center space-x-2">
                  <Badge className={getPriorityColor(formData.priority)}>
                    {getPriorityLabel(formData.priority)}
                  </Badge>
                  <div className="flex items-center space-x-1 text-xs text-slate-500">
                    {getAudienceIcon(formData.targetAudience)}
                    <span>{getAudienceLabel(formData.targetAudience)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white p-3 rounded border">
                <h5 className="font-semibold text-slate-900 mb-2">{formData.title}</h5>
                <p className="text-sm text-slate-700">{formData.message}</p>
                <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                  <span>De: {user?.nom || user?.email}</span>
                  <span>Maintenant</span>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {message && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {message}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={loading || !formData.title.trim() || !formData.message.trim()}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Envoi en cours...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Send className="h-4 w-4" />
                  <span>Envoyer l'annonce</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
