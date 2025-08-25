import { useState, useEffect, FormEvent } from 'react';
import React, { Fragment } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useFirestore } from '@/hooks/useFirestore';
import { syncRoomOccupancy } from '@/utils/roomOccupancySync';
import { clearAllRoomOccupants, isDeleteAllWorkers } from '@/utils/clearAllRoomOccupants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Enhanced sync function that automatically clears inactive workers from rooms
const syncInactiveWorkersFromRooms = async (workers: Worker[], rooms: Room[], updateRoom: any) => {
  console.log('���� Cleaning inactive workers from room occupancy...');

  const inactiveWorkers = workers.filter(w => w.statut === 'inactif');
  let updatesNeeded = 0;

  for (const room of rooms) {
    const hasInactiveWorkers = room.listeOccupants.some(occupantId =>
      inactiveWorkers.find(w => w.id === occupantId)
    );

    if (hasInactiveWorkers) {
      // Remove inactive workers from room - also validate gender match
      const activeOccupants = room.listeOccupants.filter(occupantId => {
        const worker = workers.find(w => w.id === occupantId);
        if (!worker || worker.statut !== 'actif') return false;

        // Ensure gender compatibility
        const workerGenderType = worker.sexe === 'homme' ? 'hommes' : 'femmes';
        return room.genre === workerGenderType;
      });

      if (activeOccupants.length !== room.listeOccupants.length) {
        console.log(`�� Cleaning room ${room.numero}: ${room.listeOccupants.length} → ${activeOccupants.length} occupants`);

        try {
          await updateRoom(room.id, {
            listeOccupants: activeOccupants,
            occupantsActuels: activeOccupants.length,
            updatedAt: new Date()
          });
          updatesNeeded++;
        } catch (error) {
          console.error(`❌ Failed to clean room ${room.numero}:`, error);
        }
      }
    }
  }

  console.log(`✅ Cleaned ${updatesNeeded} rooms of inactive workers`);
  return updatesNeeded;
};

import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import SupervisorSelect from '@/components/SupervisorSelect';
import { useSupervisors } from '@/hooks/useSupervisors';
import { getPreviousFarmId, getFarmName } from '@/utils/workerFarmHistory';
import { useToast } from '@/hooks/use-toast';
import {
  Users,
  UserPlus,
  User as UserIcon,
  Search,
  Edit,
  Trash2,
  Filter,
  Download,
  Upload,
  Bell,
  Phone,
  Calendar,
  MapPin,
  AlertCircle,
  X,
  Activity,
  Check,
  ChevronsUpDown,
  Clock,
  TrendingUp,
  BedDouble,
  Building,
  Building2,
  Package,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Send
} from 'lucide-react';
import { Worker, Ferme, Room, User, StockItem, AllocatedItem, WorkerTransfer } from '@shared/types';
import * as XLSX from 'xlsx';
import { doc, updateDoc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import WorkerImport from '@/components/WorkerImport';
import { WorkerConflictModal } from '@/components/WorkerConflictModal';
import { createTestNotification, debugNotificationSystem } from '@/utils/notificationTest';
import { runCrossFarmNotificationTest } from '@/utils/testCrossFarmNotifications';

export default function Workers() {
  const { user, isSuperAdmin, isUser } = useAuth();

  // Redirect regular users away from this page
  if (isUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Accès non autorisé</h2>
          <p className="text-gray-600 mb-4">
            Vous n'avez pas les permissions nécessaires pour accéder à cette page.
          </p>
          <Button
            onClick={() => window.location.href = '/statistiques'}
            className="w-full"
          >
            Aller aux Statistiques
          </Button>
        </div>
      </div>
    );
  }
  const { sendNotification, sendWorkerMovedNotificationToPreviousFarm } = useNotifications();
  const { data: allWorkers, loading: workersLoading, addDocument, updateDocument, deleteDocument } = useFirestore<Worker>('workers');
  const { data: fermes } = useFirestore<Ferme>('fermes');
  const { data: rooms, updateDocument: updateRoom } = useFirestore<Room>('rooms');
  const { data: users } = useFirestore<User>('users');
  const { supervisors } = useSupervisors();
  const { data: stocks, updateDocument: updateStock } = useFirestore<StockItem>('stocks');
  const { toast } = useToast();


  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFerme, setSelectedFerme] = useState('all');
  const [selectedGender, setSelectedGender] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedEntryMonth, setSelectedEntryMonth] = useState('all');
  const [selectedEntryYear, setSelectedEntryYear] = useState('all');
  const [selectedSupervisor, setSelectedSupervisor] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [viewHistoryWorker, setViewHistoryWorker] = useState<Worker | null>(null);
  const [isMotifOpen, setIsMotifOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferFormData, setTransferFormData] = useState({
    toFermeId: '',
    notes: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoFilledWorker, setAutoFilledWorker] = useState<string>(''); // Name of auto-filled worker
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [autoEditMode, setAutoEditMode] = useState<{
    active: boolean;
    workerId: string;
    workerCin: string;
    action: string;
    conflictFarmId: string;
    conflictFarmName: string;
    requesterFermeId: string;
    requesterName: string;
  } | null>(null);

  const [autoEditContext, setAutoEditContext] = useState<{
    requesterFermeId: string;
    requesterName: string;
    conflictFarmName: string;
  } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showAllRows, setShowAllRows] = useState(false);

  // Security code verification state
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityCode, setSecurityCode] = useState('');
  const [securityError, setSecurityError] = useState('');

  const [reactivationModal, setReactivationModal] = useState<{
    isOpen: boolean;
    existingWorker: Worker | null;
    formData: any;
  }>({
    isOpen: false,
    existingWorker: null,
    formData: null
  });

  const [crossFarmDuplicateModal, setCrossFarmDuplicateModal] = useState<{
    isOpen: boolean;
    existingWorker: Worker | null;
    currentFarm: Ferme | null;
    formData: any;
    notificationSent: boolean;
  }>({
    isOpen: false,
    existingWorker: null,
    currentFarm: null,
    formData: null,
    notificationSent: false
  });

  // Motif options for searchable select
  const motifOptions = [
    { value: 'all', label: 'Tous les motifs' },
    { value: 'none', label: 'Aucun motif' },
    { value: 'fin_contrat', label: 'Fin de contrat' },
    { value: 'demission', label: 'Démission' },
    { value: 'licenciement', label: 'Licenciement' },
    { value: 'mutation', label: 'Mutation' },
    { value: 'retraite', label: 'Retraite' },
    { value: 'opportunite_salariale', label: 'Opportunité salariale' },
    { value: 'absences_frequentes', label: 'Absences fréquentes' },
    { value: 'comportement', label: 'Comportement' },
    { value: 'salaire', label: 'Raisons salariales' },
    { value: 'depart_volontaire', label: 'Départ volontaire' },
    { value: 'horaires_nocturnes', label: 'Horaires nocturnes' },
    { value: 'adaptation_difficile', label: 'Adaptation difficile' },
    { value: 'etudes', label: 'étudiant' },
    { value: 'heures_insuffisantes', label: 'Heures insuffisantes' },
    { value: 'distance', label: 'Distance' },
    { value: 'indiscipline', label: 'Indiscipline' },
    { value: 'maladie', label: 'Maladie' },
    { value: 'respect_voisins', label: 'Respect des voisins' },
    { value: 'nature_travail', label: 'Nature du travail' },
    { value: 'sante', label: 'Santé' },
    { value: 'securite', label: 'Sécurité' },
    { value: 'rendement', label: 'Rendement' },
    { value: 'problemes_personnels', label: 'Problèmes personnels' },
    { value: 'caporal', label: 'Raison de caporal' },
    { value: 'refus_poste', label: 'Refus de poste' },
    { value: 'rejet_selection', label: 'Rejet lors de la sélection' },
    { value: 'repos_temporaire', label: 'Repos temporaire' },
    { value: 'secteur_insatisfaisant', label: 'Secteur insatisfaisant' },
    { value: 'pas_reponse', label: 'Pas de réponse' },
    { value: 'conditions_secteur', label: 'Conditions du secteur' },
    { value: 'raisons_personnelles', label: 'Raisons personnelles' },
    { value: 'autre', label: 'Autre' }
  ];

  // Advanced filters state
  const [advancedFilters, setAdvancedFilters] = useState({
    status: 'all',
    ageMin: '',
    ageMax: '',
    dateEntreeFrom: '',
    dateEntreeTo: '',
    dateSortieFrom: '',
    dateSortieTo: '',
    chambre: '',
    motif: 'all'
  });

  // Multi-selection state
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const [formData, setFormData] = useState({
    nom: '',
    cin: '',
    matricule: '',
    telephone: '',
    sexe: 'homme' as 'homme' | 'femme',
    age: 25,
    yearOfBirth: new Date().getFullYear() - 25,
    dateNaissance: '',
    fermeId: user?.fermeId || '',
    chambre: '',
    secteur: '',
    statut: 'actif' as 'actif' | 'inactif',
    dateEntree: new Date().toISOString().split('T')[0],
    dateSortie: '',
    motif: 'none',
    supervisorId: '',
    allocatedItems: {
      EPONGE: false,
      LIT: false
    }
  });

  // Calculate age from year of birth (deprecated)
  const calculateAge = (yearOfBirth: number): number => {
    const currentYear = new Date().getFullYear();
    return currentYear - yearOfBirth;
  };

  // Calculate age from full date of birth
  const calculateAgeFromDate = (dateNaissance: string): number => {
    if (!dateNaissance) return 0;
    const birthDate = new Date(dateNaissance);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  // Stock checking and allocation functions
  const getStockByItemName = (itemName: string, fermeId: string) => {
    return stocks?.find(stock =>
      stock.item === itemName &&
      (stock.secteurId === fermeId || stock.secteurId === 'centralE')
    );
  };

  const getStockCounts = (itemName: string, fermeId: string) => {
    const stock = getStockByItemName(itemName, fermeId);
    if (!stock) return { available: 0, used: 0, total: 0 };

    // Count allocated items for this specific item and farm
    const allocatedCount = allWorkers
      ?.filter(worker => worker.statut === 'actif' && worker.fermeId === fermeId)
      ?.reduce((count, worker) => {
        const allocatedItems = Array.isArray(worker.allocatedItems)
          ? worker.allocatedItems.filter(item =>
            item.itemName === itemName && item.status === 'allocated'
          )
          : [];
        return count + allocatedItems.length;
      }, 0) || 0;

    const total = stock.quantity;
    const used = allocatedCount;
    const available = Math.max(0, total - used);

    return { available, used, total };
  };

  const handleItemAllocation = async (itemName: string, isChecked: boolean) => {
    if (!user?.fermeId) return;

    const fermeId = formData.fermeId || user.fermeId;
    const stockCounts = getStockCounts(itemName, fermeId);

    if (isChecked && stockCounts.available <= 0) {
      toast({
        title: "Stock épuisé",
        description: `Impossible d'allouer ${itemName}. Stock disponible: ${stockCounts.available}`,
        variant: "destructive"
      });
      return;
    }

    setFormData(prev => ({
      ...prev,
      allocatedItems: {
        ...prev.allocatedItems,
        [itemName]: isChecked
      }
    }));


  };

  // Debug: Log room data
  useEffect(() => {
    console.log('Rooms data:', rooms.map(r => ({
      id: r.id,
      numero: r.numero,
      fermeId: r.fermeId,
      genre: r.genre,
      capaciteTotale: r.capaciteTotale,
      occupantsActuels: r.occupantsActuels
    })));
  }, [rooms]);

  // Handle URL parameters for auto-edit mode
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const autoEdit = urlParams.get('autoEdit');

    if (autoEdit === 'true') {
      const workerId = urlParams.get('workerId');
      const workerCin = urlParams.get('workerCin');
      const action = urlParams.get('action');
      const conflictFarmId = urlParams.get('conflictFarmId');
      const conflictFarmName = urlParams.get('conflictFarmName');
      const requesterFermeId = urlParams.get('requesterFermeId');
      const requesterName = urlParams.get('requesterName');

      if (workerId && workerCin && action === 'addExitDate') {
        console.log('🔧 Auto-edit mode activated for worker:', { workerId, workerCin });

        // Set auto-edit mode
        setAutoEditMode({
          active: true,
          workerId,
          workerCin,
          action,
          conflictFarmId: conflictFarmId || '',
          conflictFarmName: conflictFarmName || '',
          requesterFermeId: requesterFermeId || '',
          requesterName: requesterName || ''
        });

        // Store context for notification later
        setAutoEditContext({
          requesterFermeId: requesterFermeId || '',
          requesterName: requesterName || '',
          conflictFarmName: conflictFarmName || ''
        });

        // Set search term to worker CIN to auto-filter
        setSearchTerm(workerCin);

        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Auto-open edit modal when auto-edit mode is active and workers are loaded
  useEffect(() => {
    if (autoEditMode?.active && allWorkers.length > 0) {
      const targetWorker = allWorkers.find(w => w.id === autoEditMode.workerId || w.cin === autoEditMode.workerCin);

      if (targetWorker) {
        console.log('🎯 Auto-opening edit modal for worker:', targetWorker.nom);
        setEditingWorker(targetWorker);

        // Pre-fill exit date field with today's date if not already set
        if (!targetWorker.dateSortie) {
          const today = new Date().toISOString().split('T')[0];
          setFormData(prev => ({
            ...prev,
            dateSortie: today
          }));
        }

        // Clear auto-edit mode
        setAutoEditMode(null);
      }
    }
  }, [autoEditMode, allWorkers]);

  // Check and auto-update worker statuses on component load
  useEffect(() => {
    const updateInconsistentStatuses = async () => {
      // Find workers who have exit dates but are still marked as active
      const inconsistentWorkers = allWorkers.filter(worker =>
        worker.dateSortie && worker.statut === 'actif'
      );

      if (inconsistentWorkers.length > 0) {
        console.log(`Found ${inconsistentWorkers.length} workers with exit dates but active status. Auto-updating...`);

        // Update each inconsistent worker
        for (const worker of inconsistentWorkers) {
          try {
            await updateDocument(worker.id, {
              ...worker,
              statut: 'inactif',
              updatedAt: new Date()
            });
            console.log(`Updated worker ${worker.nom} to inactive status`);
          } catch (error) {
            console.error(`Failed to update worker ${worker.nom}:`, error);
          }
        }
      }
    };

    // Only run if we have workers data and user is authenticated
    if (allWorkers.length > 0 && user) {
      updateInconsistentStatuses();
    }
  }, [allWorkers, user, updateDocument]);

  // Filter workers based on user role and filters
  const filteredWorkers = allWorkers.filter(worker => {
    // Role-based filtering
    if (!isSuperAdmin && user?.fermeId) {
      if (worker.fermeId !== user.fermeId) return false;
    }

    // Search filter
    if (searchTerm && !worker.nom.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !worker.cin.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !(worker.matricule || '').toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Ferme filter (for superadmin)
    if (selectedFerme !== 'all' && worker.fermeId !== selectedFerme) {
      return false;
    }

    // Gender filter
    if (selectedGender !== 'all' && worker.sexe !== selectedGender) {
      return false;
    }

    // Status filter
    if (selectedStatus !== 'all' && worker.statut !== selectedStatus) {
      return false;
    }

    // Entry month filter
    if (selectedEntryMonth !== 'all' && worker.dateEntree) {
      const entryDate = new Date(worker.dateEntree);
      const entryMonth = entryDate.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
      if (entryMonth.toString() !== selectedEntryMonth) {
        return false;
      }
    }

    // Entry year filter
    if (selectedEntryYear !== 'all' && worker.dateEntree) {
      const entryDate = new Date(worker.dateEntree);
      const entryYear = entryDate.getFullYear();
      if (entryYear.toString() !== selectedEntryYear) {
        return false;
      }
    }

    // Supervisor filter
    if (selectedSupervisor !== 'all') {
      if (selectedSupervisor === 'none' && worker.supervisorId) {
        return false;
      } else if (selectedSupervisor !== 'none' && worker.supervisorId !== selectedSupervisor) {
        return false;
      }
    }

    // Company filter
    if (selectedCompany !== 'all') {
      const workerSupervisor = supervisors.find(s => s.id === worker.supervisorId);
      if (selectedCompany === 'none' && workerSupervisor?.company) {
        return false;
      } else if (selectedCompany !== 'none' && workerSupervisor?.company !== selectedCompany) {
        return false;
      }
    }

    // Advanced filters
    if (advancedFilters.status !== 'all' && worker.statut !== advancedFilters.status) {
      return false;
    }

    if (advancedFilters.ageMin && worker.age < parseInt(advancedFilters.ageMin)) {
      return false;
    }

    if (advancedFilters.ageMax && worker.age > parseInt(advancedFilters.ageMax)) {
      return false;
    }

    if (advancedFilters.dateEntreeFrom && worker.dateEntree) {
      const entryDate = new Date(worker.dateEntree);
      const filterDate = new Date(advancedFilters.dateEntreeFrom);
      if (entryDate < filterDate) return false;
    }

    if (advancedFilters.dateEntreeTo && worker.dateEntree) {
      const entryDate = new Date(worker.dateEntree);
      const filterDate = new Date(advancedFilters.dateEntreeTo);
      if (entryDate > filterDate) return false;
    }

    if (advancedFilters.dateSortieFrom && worker.dateSortie) {
      const exitDate = new Date(worker.dateSortie);
      const filterDate = new Date(advancedFilters.dateSortieFrom);
      if (exitDate < filterDate) return false;
    }

    if (advancedFilters.dateSortieTo && worker.dateSortie) {
      const exitDate = new Date(worker.dateSortie);
      const filterDate = new Date(advancedFilters.dateSortieTo);
      if (exitDate > filterDate) return false;
    }

    if (advancedFilters.chambre && !worker.chambre?.toLowerCase().includes(advancedFilters.chambre.toLowerCase())) {
      return false;
    }

    if (advancedFilters.motif !== 'all' && advancedFilters.motif !== (worker.motif || 'none')) {
      return false;
    }

    return true;
  });

  // Pagination calculations
  const totalItems = filteredWorkers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedWorkers = showAllRows ? filteredWorkers : filteredWorkers.slice(startIndex, endIndex);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedFerme, selectedGender, selectedStatus, selectedEntryMonth, selectedEntryYear, selectedSupervisor]);

  // Update selectAll state when page changes
  useEffect(() => {
    const currentPageWorkerIds = paginatedWorkers.map(w => w.id);
    const allCurrentPageSelected = currentPageWorkerIds.every(id => selectedWorkers.has(id));
    setSelectAll(allCurrentPageSelected && currentPageWorkerIds.length > 0);
  }, [currentPage, paginatedWorkers, selectedWorkers]);

  // Get available entry years from worker data
  const getAvailableEntryYears = () => {
    const years = new Set<number>();
    allWorkers.forEach(worker => {
      if (worker.dateEntree) {
        const year = new Date(worker.dateEntree).getFullYear();
        years.add(year);
      }
    });
    return Array.from(years).sort((a, b) => b - a); // Sort descending (newest first)
  };

  const availableEntryYears = getAvailableEntryYears();

  // Calculate average ages
  const calculateAverageAges = (workers: Worker[]) => {
    const activeWorkers = workers.filter(w => w.statut === 'actif');
    const menWorkers = activeWorkers.filter(w => w.sexe === 'homme');
    const womenWorkers = activeWorkers.filter(w => w.sexe === 'femme');

    const averageAgeMen = menWorkers.length > 0
      ? Math.round(menWorkers.reduce((sum, w) => sum + w.age, 0) / menWorkers.length)
      : 0;

    const averageAgeWomen = womenWorkers.length > 0
      ? Math.round(womenWorkers.reduce((sum, w) => sum + w.age, 0) / womenWorkers.length)
      : 0;

    return { averageAgeMen, averageAgeWomen };
  };

  const { averageAgeMen, averageAgeWomen } = calculateAverageAges(filteredWorkers);

  // Multi-selection utility functions
  const handleSelectAll = (checked: boolean) => {
    const currentPageWorkerIds = paginatedWorkers.map(w => w.id);
    setSelectAll(checked);

    if (checked) {
      // Add all current page workers to selection
      const newSelected = new Set(selectedWorkers);
      currentPageWorkerIds.forEach(id => newSelected.add(id));
      setSelectedWorkers(newSelected);
    } else {
      // Remove all current page workers from selection
      const newSelected = new Set(selectedWorkers);
      currentPageWorkerIds.forEach(id => newSelected.delete(id));
      setSelectedWorkers(newSelected);
    }
  };

  const handleSelectWorker = (workerId: string, checked: boolean) => {
    const newSelected = new Set(selectedWorkers);
    if (checked) {
      newSelected.add(workerId);
    } else {
      newSelected.delete(workerId);
    }
    setSelectedWorkers(newSelected);

    // Update selectAll based on current page
    const currentPageWorkerIds = paginatedWorkers.map(w => w.id);
    const allCurrentPageSelected = currentPageWorkerIds.every(id => newSelected.has(id));
    setSelectAll(allCurrentPageSelected && currentPageWorkerIds.length > 0);
  };

  const clearSelection = () => {
    setSelectedWorkers(new Set());
    setSelectAll(false);
  };

  const selectAllWorkersGlobally = () => {
    const allWorkerIds = filteredWorkers.map(w => w.id);
    setSelectedWorkers(new Set(allWorkerIds));
    setSelectAll(true);
  };

  const isAllWorkersSelected = filteredWorkers.length > 0 &&
    filteredWorkers.every(worker => selectedWorkers.has(worker.id));

  // Debug: Log worker data to check what we're getting
  useEffect(() => {
    if (allWorkers.length > 0) {
      console.log('�� Workers Debug Info:');
      console.log('Total workers loaded:', allWorkers.length);
      console.log('User fermeId:', user?.fermeId);
      console.log('Is SuperAdmin:', isSuperAdmin);

      // Show all workers with their key details
      allWorkers.forEach((worker, index) => {
        console.log(`Worker ${index + 1}:`, {
          nom: worker.nom,
          sexe: worker.sexe,
          statut: worker.statut,
          fermeId: worker.fermeId,
          cin: worker.cin
        });
      });

      const activeWorkers = allWorkers.filter(w => w.statut === 'actif');
      const maleWorkers = activeWorkers.filter(w => w.sexe === 'homme');
      const femaleWorkers = activeWorkers.filter(w => w.sexe === 'femme');

      console.log('Active workers:', activeWorkers.length);
      console.log('Male active workers:', maleWorkers.length);
      console.log('Female active workers:', femaleWorkers.length);
      console.log('Filtered workers (after role/search filters):', filteredWorkers.length);
    } else {
      console.log('⚠️ No workers data loaded yet');
    }
  }, [allWorkers, user, isSuperAdmin, filteredWorkers]);

  // Helper function to add worker to room
  const addWorkerToRoom = async (workerId: string, workerData: any) => {
    const room = rooms.find(r =>
      r.numero === workerData.chambre &&
      r.fermeId === workerData.fermeId
    );

    if (room) {
      // Validate gender match
      const workerGenderType = workerData.sexe === 'homme' ? 'hommes' : 'femmes';
      if (room.genre !== workerGenderType) {
        console.warn(` Gender mismatch: Cannot add ${workerData.sexe} to ${room.genre} room ${room.numero}. Skipping room assignment.`);
        return; // Skip room assignment instead of throwing error
      }

      const batch = writeBatch(db);
      const roomRef = doc(db, 'rooms', room.id);

      // Add worker to room if not already there
      if (!room.listeOccupants.includes(workerId)) {
        batch.update(roomRef, {
          listeOccupants: [...room.listeOccupants, workerId],
          occupantsActuels: room.occupantsActuels + 1,
          updatedAt: new Date()
        });

        await batch.commit();
        console.log(` Added worker to room ${room.numero} (${workerGenderType})`);
      }
    }
  };

  // Helper function to update room occupancy when worker changes
  const updateRoomOccupancy = async (oldWorkerData: Worker, newWorkerData: any) => {
    const batch = writeBatch(db);

    // Remove from old room if they were previously active and assigned
    if (oldWorkerData.chambre && oldWorkerData.statut === 'actif') {
      const oldRoom = rooms.find(r =>
        r.numero === oldWorkerData.chambre &&
        r.fermeId === oldWorkerData.fermeId
      );

      if (oldRoom) {
        const roomRef = doc(db, 'rooms', oldRoom.id);
        const updatedOccupants = oldRoom.listeOccupants.filter(id => id !== oldWorkerData.id);

        batch.update(roomRef, {
          listeOccupants: updatedOccupants,
          occupantsActuels: Math.max(0, oldRoom.occupantsActuels - 1),
          updatedAt: new Date()
        });

        console.log(`📤 Removed worker ${oldWorkerData.nom} from room ${oldRoom.numero}`);
      }
    }

    // Add to new room only if:
    // 1. Worker is active (no exit date)
    // 2. Worker is assigned to a room
    // 3. Worker gender matches room gender
    if (newWorkerData.chambre && newWorkerData.statut === 'actif') {
      const newRoom = rooms.find(r =>
        r.numero === newWorkerData.chambre &&
        r.fermeId === newWorkerData.fermeId
      );

      if (newRoom) {
        // Validate gender match
        const workerGenderType = newWorkerData.sexe === 'homme' ? 'hommes' : 'femmes';
        if (newRoom.genre !== workerGenderType) {
          console.warn(`⚠️ Gender mismatch: Worker ${oldWorkerData.nom} (${newWorkerData.sexe}) cannot be assigned to room ${newRoom.numero} (${newRoom.genre}). Clearing room assignment.`);

          // Clear the room assignment in the worker data to prevent the mismatch
          newWorkerData.chambre = '';
          newWorkerData.dortoir = '';

          // Update the worker document to clear the invalid room assignment
          try {
            await updateDocument(oldWorkerData.id, {
              chambre: '',
              secteur: '',
              updatedAt: new Date()
            });
            console.log(`��� Cleared invalid room assignment for worker ${oldWorkerData.nom}`);
          } catch (clearError) {
            console.error(` Failed to clear room assignment:`, clearError);
          }

          // Skip room assignment
          return;
        }

        // Add worker if not already in the room
        if (!newRoom.listeOccupants.includes(oldWorkerData.id)) {
          const roomRef = doc(db, 'rooms', newRoom.id);

          batch.update(roomRef, {
            listeOccupants: [...newRoom.listeOccupants, oldWorkerData.id],
            occupantsActuels: newRoom.occupantsActuels + 1,
            updatedAt: new Date()
          });

          console.log(` Added worker ${oldWorkerData.nom} to room ${newRoom.numero}`);
        }
      }
    } else if (newWorkerData.statut === 'inactif') {
      console.log(` Worker ${oldWorkerData.nom} marked as inactive - removed from room`);
    }

    try {
      await batch.commit();
      console.log(` Updated room occupancy for worker changes`);
    } catch (error) {
      console.error('Error committing batch:', error);
    }
  };

  // Auto-fill form when CIN matches an inactive worker
  const handleCinChange = (cin: string) => {
    // Update CIN in form
    setFormData(prev => ({ ...prev, cin }));

    // Clear any previous errors and auto-fill indicators
    setError('');
    setAutoFilledWorker('');

    // Only auto-fill if we're adding a new worker (not editing) and CIN is at least 6 characters
    if (!editingWorker && cin.length >= 6) {
      const existingWorker = allWorkers.find(w =>
        w.cin.toLowerCase() === cin.toLowerCase()
      );

      if (existingWorker && existingWorker.statut === 'inactif') {
        // Auto-fill form with existing worker data
        setFormData(prev => ({
          ...prev,
          cin: cin, // Keep the typed CIN
          nom: existingWorker.nom,
          telephone: existingWorker.telephone,
          sexe: existingWorker.sexe,
          age: existingWorker.age,
          yearOfBirth: existingWorker.yearOfBirth || new Date().getFullYear() - existingWorker.age,
          dateNaissance: existingWorker.dateNaissance || '',
          fermeId: user?.fermeId || existingWorker.fermeId, // Use current user's farm or existing farm
          secteur: existingWorker.secteur || '',
          statut: 'actif', // Set to active for reactivation
          dateEntree: new Date().toISOString().split('T')[0], // Today's date
          dateSortie: '',
          motif: 'none',
          chambre: '', // Let user choose new room
          supervisorId: existingWorker.supervisorId || '',
          allocatedItems: {
            EPONGE: false,
            LIT: false
          }
        }));

        // Set auto-fill indicator
        setAutoFilledWorker(existingWorker.nom);
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingWorker) {
        const updateData = {
          ...formData,
          age: formData.dateNaissance ? calculateAgeFromDate(formData.dateNaissance) : calculateAge(formData.yearOfBirth),
          dateEntree: formData.dateEntree || editingWorker.dateEntree
        };

        // Check if entry date has been modified
        const entryDateChanged = formData.dateEntree && formData.dateEntree !== editingWorker.dateEntree;

        // Handle work history updates
        const existingHistory = editingWorker.workHistory || [];
        let updatedHistory = [...existingHistory];

        // Ensure the main worker record's current period is preserved in history
        const mainPeriodInHistory = existingHistory.some(period =>
          period.dateEntree === editingWorker.dateEntree
        );

        if (!mainPeriodInHistory && editingWorker.dateEntree) {
          // Add the main worker's current period to history
          const mainPeriod = {
            id: `main_edit_${Date.now()}`,
            dateEntree: editingWorker.dateEntree,
            dateSortie: editingWorker.dateSortie,
            motif: editingWorker.motif || 'none',
            chambre: editingWorker.chambre,
            secteur: editingWorker.secteur,
            fermeId: editingWorker.fermeId
          };
          updatedHistory.push(mainPeriod);
          console.log('✅ Added main worker period to history during edit');
        }

        if (entryDateChanged) {
          console.log('📅 Entry date modified - updating work history');

          // Find the current active period (matching the original entry date)
          const currentPeriodIndex = updatedHistory.findIndex(period =>
            period.dateEntree === editingWorker.dateEntree && !period.dateSortie
          );

          if (currentPeriodIndex !== -1) {
            // Update the existing period with the new entry date
            updatedHistory[currentPeriodIndex] = {
              ...updatedHistory[currentPeriodIndex],
              dateEntree: formData.dateEntree,
              chambre: formData.chambre || updatedHistory[currentPeriodIndex].chambre,
              secteur: formData.secteur || updatedHistory[currentPeriodIndex].secteur
            };
            console.log('✅ Updated existing period with new entry date');
          } else {
            // If no matching period found, update any existing period with the old date
            // or create a new one with the new entry date
            const existingPeriodIndex = updatedHistory.findIndex(period =>
              period.dateEntree === editingWorker.dateEntree
            );

            if (existingPeriodIndex !== -1) {
              updatedHistory[existingPeriodIndex].dateEntree = formData.dateEntree;
            }
          }

          // Sort by entry date
          updatedHistory.sort((a, b) => new Date(a.dateEntree).getTime() - new Date(b.dateEntree).getTime());
          updateData.workHistory = updatedHistory;
        }

        // Handle exit date separately (if provided)
        if (formData.dateSortie) {
          updateData.dateSortie = formData.dateSortie;
          updateData.statut = 'inactif'; // Automatically set to inactive when exit date is added

          // Return allocated items to stock when worker exits
          if (editingWorker.allocatedItems && editingWorker.allocatedItems.length > 0) {
            const returnedItems: AllocatedItem[] = [];

            for (const allocatedItem of editingWorker.allocatedItems) {
              if (allocatedItem.status === 'allocated') {
                // Mark item as returned
                returnedItems.push({
                  ...allocatedItem,
                  status: 'returned',
                  returnedAt: new Date().toISOString()
                });

                // Stock quantity remains unchanged - allocation tracking is done via allocatedItems
                const stock = await getStockByItemName(allocatedItem.itemName, editingWorker.fermeId);
                if (stock) {
                  // No need to modify stock quantity - just update lastUpdated
                  await updateStock(stock.id, {
                    ...stock,
                    lastUpdated: new Date().toISOString()
                  });
                }
              } else {
                returnedItems.push(allocatedItem);
              }
            }

            updateData.allocatedItems = returnedItems;

            toast({
              title: "Articles retournés",
              description: `${editingWorker.allocatedItems.filter(item => item.status === 'allocated').length} article(s) retourné(s) au stock`,
            });
          }

          // Send notification about exit date addition - this could help resolve conflicts
          await sendExitDateNotification(editingWorker, formData.dateSortie, formData.motif);

          // Update work history to close the current period
          if (!entryDateChanged) {
            updatedHistory = [...(editingWorker.workHistory || [])];
          }

          // Find the current active period (using the current entry date)
          const currentEntryDate = formData.dateEntree || editingWorker.dateEntree;
          const currentPeriodIndex = updatedHistory.findIndex(period =>
            period.dateEntree === currentEntryDate && !period.dateSortie
          );

          if (currentPeriodIndex !== -1) {
            // Update the existing period with exit information
            updatedHistory[currentPeriodIndex] = {
              ...updatedHistory[currentPeriodIndex],
              dateSortie: formData.dateSortie,
              motif: formData.motif || 'none'
            };
            updateData.workHistory = updatedHistory;
            console.log('✅ Updated existing period in work history with exit date');
          } else {
            // If no matching period found, create one for the current worker state
            const currentPeriod = {
              id: `period_${Date.now()}`,
              dateEntree: currentEntryDate,
              dateSortie: formData.dateSortie,
              motif: formData.motif || 'none',
              chambre: formData.chambre || editingWorker.chambre,
              secteur: formData.secteur || editingWorker.secteur,
              fermeId: formData.fermeId || editingWorker.fermeId
            };

            updatedHistory.push(currentPeriod);
            // Sort by entry date
            updatedHistory.sort((a, b) => new Date(a.dateEntree).getTime() - new Date(b.dateEntree).getTime());
            updateData.workHistory = updatedHistory;
            console.log('✅ Created new period in work history with exit date');
          }
        } else {
          // If no exit date, ensure status remains actif (unless manually changed)
          updateData.statut = formData.statut || 'actif';
        }

        if (formData.motif && formData.motif !== 'none') {
          updateData.motif = formData.motif;
        }

        await updateDocument(editingWorker.id, updateData);

        // Send notifications only for significant changes to higher administrators
        // Get all superadmins (excluding the current user who made the change)
        const getSuperAdmins = async () => {
          try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const superAdmins = allUsers.filter(userData =>
              userData.role === 'superadmin' &&
              userData.id !== user?.uid // Exclude the current user (use id not uid)
            );
            console.log('📋 Found superadmins for notifications:', superAdmins.map(admin => ({ id: admin.id, email: admin.email })));
            return superAdmins;
          } catch (error) {
            console.error('Error fetching superadmins:', error);
            return [];
          }
        };

        // Only send notifications to superadmins for important changes (not simple field updates)
        try {
          const superAdmins = await getSuperAdmins();
          const currentFarm = fermes.find(f => f.id === editingWorker.fermeId);

          if (entryDateChanged && !formData.dateSortie) {
            // Entry date was modified - notify superadmins
            for (const admin of superAdmins) {
              await sendNotification({
                type: 'worker_updated',
                title: '📅 Date d\'entrée modifiée',
                message: `La date d'entrée de ${editingWorker.nom} (${currentFarm?.nom || 'Ferme inconnue'}) a été mise à jour du ${new Date(editingWorker.dateEntree).toLocaleDateString('fr-FR')} au ${new Date(formData.dateEntree).toLocaleDateString('fr-FR')}`,
                recipientId: admin.id,
                recipientFermeId: admin.fermeId || 'central',
                status: 'unread',
                priority: 'medium',
                createdBy: user?.uid,
                createdByName: user?.nom || user?.email || 'Utilisateur'
              });
            }
            console.log(`✅ Entry date modification notified to ${superAdmins.length} superadmin(s)`);
          } else if (formData.dateSortie && !editingWorker.dateSortie) {
            // Exit date was added - notify superadmins
            for (const admin of superAdmins) {
              await sendNotification({
                type: 'worker_updated',
                title: '🚪 Date de sortie ajoutée',
                message: `Date de sortie ajoutée pour ${editingWorker.nom} (${currentFarm?.nom || 'Ferme inconnue'}): ${new Date(formData.dateSortie).toLocaleDateString('fr-FR')}${formData.motif ? ` - Motif: ${formData.motif}` : ''}`,
                recipientId: admin.id,
                recipientFermeId: admin.fermeId || 'central',
                status: 'unread',
                priority: 'high',
                createdBy: user?.uid,
                createdByName: user?.nom || user?.email || 'Utilisateur'
              });
            }
            console.log(`✅ Exit date addition notified to ${superAdmins.length} superadmin(s)`);
          }
          // Simple field changes (phone, CIN, name, etc.) don't trigger notifications
        } catch (notificationError) {
          console.error('❌ Failed to send worker update notification:', notificationError);
        }

        // Clear auto-edit context if exit date was added in conflict resolution
        const gotExitDate = !editingWorker.dateSortie && updateData.dateSortie;
        if (gotExitDate && autoEditContext) {
          console.log('✅ Exit date added in auto-edit mode, clearing context');
          setAutoEditContext(null);
        }

        // Handle room occupancy changes if room assignment changed OR worker became inactive
        const statusChanged = editingWorker.statut !== updateData.statut;
        const roomChanged = editingWorker.chambre !== formData.chambre;
        // gotExitDate already declared above for notification logic

        if (roomChanged || statusChanged || gotExitDate) {
          console.log(`🔄 Room occupancy update needed: room changed: ${roomChanged}, status changed: ${statusChanged}, got exit date: ${gotExitDate}`);

          // Check for gender mismatch before updating
          if (formData.chambre && formData.statut === 'actif') {
            const selectedRoom = rooms.find(r =>
              r.numero === formData.chambre &&
              r.fermeId === formData.fermeId
            );

            if (selectedRoom) {
              const workerGenderType = formData.sexe === 'homme' ? 'hommes' : 'femmes';
              if (selectedRoom.genre !== workerGenderType) {
                setError(` Attention: La chambre ${formData.chambre} est réservée aux ${selectedRoom.genre}, mais l'ouvrier est un ${formData.sexe}. L'assignment de chambre a été annulée.`);

                // Clear the room assignment in the form
                setFormData(prev => ({
                  ...prev,
                  chambre: '',
                  dortoir: ''
                }));
              }
            }
          }

          await updateRoomOccupancy(editingWorker, updateData);
        }
      } else {
        // Comprehensive cross-farm duplicate checking
        const duplicateCheck = await checkCrossFarmDuplicates(formData);

        if (duplicateCheck.isDuplicate) {
          // Duplicate found and handled by the checking function
          return;
        }

        // Process allocated items
        const allocatedItems: AllocatedItem[] = [];
        for (const [itemName, isAllocated] of Object.entries(formData.allocatedItems)) {
          if (isAllocated) {
            const stock = getStockByItemName(itemName, formData.fermeId);
            if (stock) {
              allocatedItems.push({
                id: `alloc_${Date.now()}_${itemName}`,
                itemName,
                allocatedAt: new Date().toISOString(),
                allocatedBy: user?.uid || '',
                stockItemId: stock.id,
                fermeId: formData.fermeId,
                status: 'allocated'
              });

              // Stock quantity remains unchanged - allocation tracking is done via allocatedItems
            }
          }
        }

        const newWorkerId = await addDocument({
          ...formData,
          age: formData.dateNaissance ? calculateAgeFromDate(formData.dateNaissance) : calculateAge(formData.yearOfBirth),
          dateEntree: formData.dateEntree, // Use the selected date from form
          allocatedItems, // Add allocated items to worker record
          workHistory: [{
            id: `history_${Date.now()}`,
            dateEntree: formData.dateEntree, // Use the selected date from form
            chambre: formData.chambre,
            secteur: formData.secteur,
            fermeId: formData.fermeId
          }],
          returnCount: 0,
          totalWorkDays: 0
        });

        // Add worker to room if assigned and active
        if (formData.chambre && formData.statut === 'actif') {
          await addWorkerToRoom(newWorkerId, formData);
        }

        // Send notification to superadmins about new worker entry
        try {
          const usersSnapshot = await getDocs(collection(db, 'users'));
          const superAdmins = usersSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(userData =>
              userData.role === 'superadmin' &&
              userData.id !== user?.uid // Exclude the current user (use id not uid)
            );

          const currentFarm = fermes.find(f => f.id === formData.fermeId);

          for (const admin of superAdmins) {
            await sendNotification({
              type: 'worker_updated',
              title: '👷 Nouveau travailleur ajouté',
              message: `Nouveau travailleur ${formData.nom} ajouté à ${currentFarm?.nom || 'Ferme inconnue'} le ${new Date(formData.dateEntree).toLocaleDateString('fr-FR')} (CIN: ${formData.cin})`,
              recipientId: admin.id,
              recipientFermeId: admin.fermeId || 'central',
              status: 'unread',
              priority: 'medium',
              createdBy: user?.uid,
              createdByName: user?.nom || user?.email || 'Utilisateur',
              actionData: {
                workerId: newWorkerId,
                workerName: formData.nom,
                workerCin: formData.cin,
                actionRequired: 'Nouveau travailleur ajouté',
                actionUrl: '/workers'
              }
            });
          }
          console.log(`✅ New worker notification sent to ${superAdmins.length} superadmin(s)`);
        } catch (notificationError) {
          console.error('❌ Failed to send new worker notification:', notificationError);
        }
      }

      // Reset form
      setFormData({
        nom: '',
        cin: '',
        matricule: '',
        telephone: '',
        sexe: 'homme',
        age: 25,
        yearOfBirth: new Date().getFullYear() - 25,
        dateNaissance: '',
        fermeId: user?.fermeId || '',
        chambre: '',
        secteur: '',
        statut: 'actif',
        dateEntree: new Date().toISOString().split('T')[0],
        dateSortie: '',
        motif: 'none',
        supervisorId: '',
        allocatedItems: {
          EPONGE: false,
          LIT: false
        }
      });
      setEditingWorker(null);
      setAutoFilledWorker('');
      setIsAddDialogOpen(false);
    } catch (error: any) {
      setError(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  // Handle reactivation confirmation
  const handleReactivationConfirm = async () => {
    if (!reactivationModal.existingWorker || !reactivationModal.formData) return;

    setLoading(true);
    try {
      const existingWorkerByCIN = reactivationModal.existingWorker;
      const formData = reactivationModal.formData;
      const selectedEntryDate = formData.dateEntree;
      console.log('🔄 Reactivation with selected date:', {
        workerName: existingWorkerByCIN.nom,
        selectedDate: selectedEntryDate,
        todaysDate: new Date().toISOString().split('T')[0],
        isToday: selectedEntryDate === new Date().toISOString().split('T')[0]
      });

      // Preserve existing work history and properly handle the current period
      const existingHistory = existingWorkerByCIN.workHistory || [];

      // Create a complete work history by properly including the main worker record's period
      let completeHistory = [...existingHistory];

      // Check if the main worker's current period is already in the work history
      const mainPeriodInHistory = existingHistory.some(period =>
        period.dateEntree === existingWorkerByCIN.dateEntree
      );

      // If the main worker's period is not in the history, add it
      if (!mainPeriodInHistory && existingWorkerByCIN.dateEntree) {
        const mainPeriod = {
          id: `main_period_${Date.now()}`,
          dateEntree: existingWorkerByCIN.dateEntree,
          dateSortie: existingWorkerByCIN.dateSortie,
          motif: existingWorkerByCIN.motif || 'none',
          chambre: existingWorkerByCIN.chambre,
          secteur: existingWorkerByCIN.secteur,
          fermeId: existingWorkerByCIN.fermeId
        };
        completeHistory.push(mainPeriod);
      }

      // Sort the complete history by entry date
      completeHistory.sort((a, b) => new Date(a.dateEntree).getTime() - new Date(b.dateEntree).getTime());

      // Ensure all periods have proper exit dates (for inactive workers)
      const updatedHistory = completeHistory.map(period => {
        // If this period doesn't have an exit date but worker is inactive, it needs one
        if (!period.dateSortie && existingWorkerByCIN.statut === 'inactif') {
          return {
            ...period,
            dateSortie: existingWorkerByCIN.dateSortie || period.dateEntree, // Use worker's exit date or entry date as fallback
            motif: period.motif || existingWorkerByCIN.motif || 'none'
          };
        }
        return period;
      });

      const reactivationData = {
        ...formData,
        statut: 'actif',
        dateEntree: selectedEntryDate, // Use selected date, not current date
        dateSortie: null, // Clear exit date for reactivation
        motif: null, // Clear exit motif for reactivation
        age: calculateAge(formData.yearOfBirth || existingWorkerByCIN.yearOfBirth),
        returnCount: (existingWorkerByCIN.returnCount || 0) + 1,
        workHistory: [
          ...updatedHistory, // Keep all previous history with proper closure
          {
            id: `history_${Date.now()}`,
            dateEntree: selectedEntryDate, // Use selected date
            chambre: formData.chambre,
            secteur: formData.secteur,
            fermeId: formData.fermeId
          }
        ]
      };

      await updateDocument(existingWorkerByCIN.id, reactivationData);

      // Add to room if assigned
      if (formData.chambre && formData.statut === 'actif') {
        await addWorkerToRoom(existingWorkerByCIN.id, reactivationData);
      }

      // Close modal and reset form
      setReactivationModal({ isOpen: false, existingWorker: null, formData: null });
      setFormData({
        nom: '',
        cin: '',
        matricule: '',
        telephone: '',
        sexe: 'homme',
        age: 25,
        yearOfBirth: new Date().getFullYear() - 25,
        dateNaissance: '',
        fermeId: user?.fermeId || '',
        chambre: '',
        secteur: '',
        statut: 'actif',
        dateEntree: new Date().toISOString().split('T')[0],
        dateSortie: '',
        motif: 'none',
        supervisorId: '',
        allocatedItems: {
          EPONGE: false,
          LIT: false
        }
      });
      setEditingWorker(null);
      setAutoFilledWorker('');
      setIsAddDialogOpen(false);

      // Success notification
      setTimeout(() => {
        alert(`✅ Ouvrier réactivé: ${existingWorkerByCIN.nom} a été réactivé avec succès et ajouté à son historique.`);
      }, 100);

    } catch (error: any) {
      setError(error.message || 'Erreur lors de la réactivation');
    } finally {
      setLoading(false);
    }
  };

  // Send notification when exit date is added (might resolve conflicts)
  const sendExitDateNotification = async (worker: Worker, exitDate: string, motif?: string) => {
    try {
      const workerFarm = fermes.find(f => f.id === worker.fermeId);
      if (!workerFarm) return;

      // Get all superadmins (excluding the current user who made the change)
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const superAdmins = allUsers.filter(userData =>
        userData.role === 'superadmin' &&
        userData.id !== user?.uid // Exclude the current user (use id not uid)
      );
      console.log('📋 Exit notification - Found superadmins:', superAdmins.map(admin => ({ id: admin.id, email: admin.email })));

      // Notify superadmins about the exit date addition
      for (const admin of superAdmins) {
        await sendNotification({
          type: 'worker_exit_confirmed',
          title: ' Date de sortie ajoutée',
          message: `Une date de sortie (${new Date(exitDate).toLocaleDateString('fr-FR')}) a été ajoutée pour l'ouvrier ${worker.nom} (${workerFarm.nom}) par ${user?.nom || user?.email}. Motif: ${motif || 'Non spécifié'}`,
          recipientId: admin.id,
          recipientFermeId: admin.fermeId || 'central',
          status: 'unread',
          priority: 'high',
          createdBy: user?.uid,
          createdByName: user?.nom || user?.email || 'Utilisateur',
          actionData: {
            workerId: worker.id,
            workerName: worker.nom,
            workerCin: worker.cin,
            actionRequired: 'Date de sortie ajoutée',
            actionUrl: `/workers/${worker.id}`
          }
        });
      }

      console.log(`✅ Exit date notification sent to ${superAdmins.length} superadmin(s)`);
    } catch (error) {
      console.error('❌ Failed to send exit date notification:', error);
    }
  };



  // Transfer worker from another farm while preserving history
  const transferWorkerToNewFarm = async (existingWorker: Worker, newFormData: any) => {
    try {
      console.log('🔄 Transferring worker to new farm:', {
        worker: existingWorker.nom,
        fromFarm: existingWorker.fermeId,
        toFarm: newFormData.fermeId,
        selectedDate: newFormData.dateEntree
      });

      // Preserve existing work history and properly close current period
      const existingHistory = existingWorker.workHistory || [];
      let completeHistory = [...existingHistory];

      // Check if the main worker's current period is already in work history
      const mainPeriodInHistory = existingHistory.some(period =>
        period.dateEntree === existingWorker.dateEntree
      );

      // If main period is not in history, add it with proper closure
      if (!mainPeriodInHistory && existingWorker.dateEntree) {
        const mainPeriod = {
          id: `transfer_period_${Date.now()}`,
          dateEntree: existingWorker.dateEntree,
          dateSortie: existingWorker.dateSortie || new Date().toISOString().split('T')[0], // Close period if not already closed
          motif: existingWorker.motif || 'mutation', // Set transfer as reason if no motif
          chambre: existingWorker.chambre,
          secteur: existingWorker.secteur,
          fermeId: existingWorker.fermeId
        };
        completeHistory.push(mainPeriod);
      }

      // Ensure all previous periods are properly closed
      const closedHistory = completeHistory.map(period => {
        if (!period.dateSortie && period.dateEntree !== newFormData.dateEntree) {
          return {
            ...period,
            dateSortie: period.dateEntree, // Fallback closure date
            motif: period.motif || 'transfert'
          };
        }
        return period;
      });

      // Sort history by entry date
      closedHistory.sort((a, b) => new Date(a.dateEntree).getTime() - new Date(b.dateEntree).getTime());

      // Create transfer data with new entry period
      const transferData = {
        ...newFormData,
        statut: 'actif',
        dateEntree: newFormData.dateEntree, // Use selected date
        dateSortie: null, // Clear exit date for new period
        motif: null, // Clear exit motif for new period
        age: calculateAge(newFormData.yearOfBirth || existingWorker.yearOfBirth),
        returnCount: (existingWorker.returnCount || 0) + 1,
        totalWorkDays: (existingWorker.totalWorkDays || 0),
        workHistory: [
          ...closedHistory, // Keep all previous history
          {
            id: `transfer_entry_${Date.now()}`,
            dateEntree: newFormData.dateEntree, // Use selected date
            chambre: newFormData.chambre,
            secteur: newFormData.secteur,
            fermeId: newFormData.fermeId
          }
        ]
      };

      // Update the existing worker record (don't create new one)
      await updateDocument(existingWorker.id, transferData);

      // Add to room if assigned
      if (newFormData.chambre && newFormData.statut === 'actif') {
        await addWorkerToRoom(existingWorker.id, transferData);
      }

      // Send notification to previous farm admins about worker transfer
      try {
        const previousFarmId = getPreviousFarmId(existingWorker, newFormData.fermeId);
        if (previousFarmId) {
          const newFarmName = getFarmName(newFormData.fermeId, fermes || []);

          await sendWorkerMovedNotificationToPreviousFarm(
            {
              id: existingWorker.id,
              nom: existingWorker.nom,
              cin: existingWorker.cin,
              previousFermeId: previousFarmId,
              newFermeId: newFormData.fermeId,
              newFermeName: newFarmName
            },
            fermes || [],
            users || []
          );

          console.log(`✅ Notification sent to previous farm (${previousFarmId}) about worker transfer`);
        } else {
          console.log('ℹ️ No previous farm found for notification');
        }
      } catch (notificationError) {
        console.error('❌ Failed to send worker transfer notification:', notificationError);
      }

      // Success notification
      setTimeout(() => {
        alert(`✅ Ouvrier transféré avec succès!\n\n${existingWorker.nom} a été transféré avec son historique complet préservé.`);
      }, 100);

      // Close modal and reset form
      setIsAddDialogOpen(false);
      setFormData({
        nom: '',
        cin: '',
        matricule: '',
        telephone: '',
        sexe: 'homme',
        age: 25,
        yearOfBirth: new Date().getFullYear() - 25,
        dateNaissance: '',
        fermeId: user?.fermeId || '',
        chambre: '',
        secteur: '',
        statut: 'actif',
        dateEntree: new Date().toISOString().split('T')[0],
        dateSortie: '',
        motif: 'none',
        supervisorId: '',
        allocatedItems: {
          EPONGE: false,
          LIT: false
        }
      });

      console.log('✅ Worker transfer completed successfully');
    } catch (error) {
      console.error(' Failed to transfer worker:', error);
      setError('Erreur lors du transfert de l\'ouvrier');
      throw error;
    }
  };

  // Cross-farm duplicate checking function
  const checkCrossFarmDuplicates = async (formData: any) => {
    console.log('🔍 Starting cross-farm duplicate check...');

    try {
      // Check by CIN (National ID) - this is the primary check
      const existingWorkerByCIN = allWorkers.find(w =>
        w.cin.toLowerCase() === formData.cin.toLowerCase()
      );

      // Check by full name - secondary check
      const existingWorkerByName = allWorkers.find(w =>
        w.nom.toLowerCase().trim() === formData.nom.toLowerCase().trim() &&
        w.cin.toLowerCase() !== formData.cin.toLowerCase() // Different CIN but same name
      );

      // Primary check: Worker with same CIN exists
      if (existingWorkerByCIN) {
        const workerFarm = fermes.find(f => f.id === existingWorkerByCIN.fermeId);

        if (existingWorkerByCIN.statut === 'actif') {
          // Worker is active in another farm - this is a critical issue
          if (existingWorkerByCIN.fermeId !== user?.fermeId) {
            console.log('❌ Active worker found in different farm:', {
              worker: existingWorkerByCIN.nom,
              currentFarm: workerFarm?.nom,
              attemptingFarm: user?.fermeId
            });

            // Automatically send notification to the farm where worker is currently active
            let notificationSent = false;
            try {
              if (workerFarm && workerFarm.admins && workerFarm.admins.length > 0) {
                const currentUserFarmName = fermes.find(f => f.id === user?.fermeId)?.nom || 'une autre ferme';

                // Send notifications only to admins of the farm where worker is currently active
                // Exclude superadmin users from receiving notifications
                const validAdmins = workerFarm.admins.filter(adminId => {
                  // Don't send to the user who is trying to register (they shouldn't be admin of the current farm anyway)
                  if (adminId === user?.uid) return false;

                  // Check if the admin is a superadmin and exclude them
                  const adminUser = users?.find(u => u.uid === adminId);
                  if (adminUser?.role === 'superadmin') {
                    console.log(`🚫 Skipping superadmin: ${adminId} (${adminUser.email})`);
                    return false;
                  }

                  return true;
                });

                console.log(`📤 Sending duplicate worker notifications to ${validAdmins.length} admin(s) of ${workerFarm.nom}:`);
                console.log('📋 Notification details:', {
                  workerName: existingWorkerByCIN.nom,
                  workerCin: existingWorkerByCIN.cin,
                  currentFarm: workerFarm.nom,
                  attemptingFarm: currentUserFarmName,
                  totalAdmins: workerFarm.admins.length,
                  validAdmins: validAdmins.length,
                  validAdminIds: validAdmins
                });

                // DISABLED: Automatic notification sending - now manual via modal button
                /*
                for (const adminId of validAdmins) {
                  try {
                    await sendNotification({
                      type: 'worker_duplicate',
                      title: '🚨 Tentative d\'enregistrement d\'un ouvrier actif',
                      message: `L'ouvrier ${existingWorkerByCIN.nom} (CIN: ${existingWorkerByCIN.cin}) est actuellement actif dans votre ferme "${workerFarm.nom}" depuis le ${new Date(existingWorkerByCIN.dateEntree).toLocaleDateString('fr-FR')}. Quelqu'un de "${currentUserFarmName}" tente maintenant de l'enregistrer dans leur ferme. Veuillez vérifier son statut et ajouter une date de sortie si l'ouvrier a quitté votre ferme.`,
                      recipientId: adminId,
                      recipientFermeId: workerFarm.id,
                      status: 'unread',
                      priority: 'urgent',
                      actionData: {
                        workerId: existingWorkerByCIN.id,
                        workerName: existingWorkerByCIN.nom,
                        workerCin: existingWorkerByCIN.cin,
                        requesterFermeId: user?.fermeId,
                        requesterFermeName: currentUserFarmName,
                        actionRequired: 'Ajouter une date de sortie à l\'ouvrier',
                        actionUrl: `/workers?search=${existingWorkerByCIN.cin}`
                      }
                    });
                    console.log(`✅ Notification sent to admin ${adminId}`);
                  } catch (notificationError) {
                    console.error(`❌ Failed to send notification to admin ${adminId}:`, notificationError);
                  }
                }
                */
                notificationSent = false; // Set to false since no notification is sent automatically
              }
            } catch (error) {
              console.error('❌ Failed to send duplicate worker notifications:', error);
            }

            // Show modal with information (notification already sent automatically)
            setCrossFarmDuplicateModal({
              isOpen: true,
              existingWorker: existingWorkerByCIN,
              currentFarm: workerFarm || null,
              formData: {
                ...formData,
                attemptedBy: user?.uid,
                attemptedByName: user?.nom,
                fermeId: user?.fermeId
              },
              notificationSent: notificationSent
            });

            return { isDuplicate: true, type: 'cross-farm-active' };
          } else {
            // Worker is active in the same farm - show error
            setError(`⚠️ Un ouvrier actif avec ce CIN (${formData.cin}) existe déjà: ${existingWorkerByCIN.nom}`);
            return { isDuplicate: true, type: 'same-farm-active' };
          }
        } else if (existingWorkerByCIN.fermeId === user?.fermeId) {
          // Inactive worker in same farm - show reactivation modal
          setReactivationModal({
            isOpen: true,
            existingWorker: existingWorkerByCIN,
            formData: formData
          });
          return { isDuplicate: true, type: 'same-farm-inactive' };
        } else {
          // Inactive worker in different farm - transfer instead of creating new record
          const shouldTransfer = window.confirm(
            `⚠️ Attention: Un ouvrier avec ce CIN existe dans une autre ferme (${workerFarm?.nom}) mais est marqué comme inactif.\n\n` +
            `Nom: ${existingWorkerByCIN.nom}\n` +
            `Dernière sortie: ${existingWorkerByCIN.dateSortie ? new Date(existingWorkerByCIN.dateSortie).toLocaleDateString('fr-FR') : 'Non spécifiée'}\n\n` +
            `Voulez-vous le transférer dans votre ferme en préservant son historique ?`
          );

          if (!shouldTransfer) {
            return { isDuplicate: true, type: 'cross-farm-inactive-blocked' };
          }

          // Transfer worker to current farm with proper history tracking
          await transferWorkerToNewFarm(existingWorkerByCIN, formData);
          return { isDuplicate: true, type: 'transferred' };
        }
      }

      // Secondary check: Worker with same name but different CIN
      if (existingWorkerByName && existingWorkerByName.statut === 'actif') {
        const workerFarm = fermes.find(f => f.id === existingWorkerByName.fermeId);

        const shouldContinue = window.confirm(
          `⚠ Attention: Un ouvrier avec un nom similaire existe déjà et est actif dans ${workerFarm?.nom || 'une autre ferme'}:\n\n` +
          `Nom existant: ${existingWorkerByName.nom} (CIN: ${existingWorkerByName.cin})\n` +
          `Nouveau: ${formData.nom} (CIN: ${formData.cin})\n\n` +
          `Êtes-vous sûr qu'il s'agit de personnes différentes ?`
        );

        if (!shouldContinue) {
          return { isDuplicate: true, type: 'name-similarity-blocked' };
        }
      }

      console.log(' No blocking duplicates found, registration can proceed');
      return { isDuplicate: false, type: 'no-duplicate' };

    } catch (error) {
      console.error('❌ Error during cross-farm duplicate check:', error);
      setError('Erreur lors de la vérification des doublons');
      return { isDuplicate: true, type: 'error' };
    }
  };



  const handleEdit = (worker: Worker) => {
    setFormData({
      nom: worker.nom,
      cin: worker.cin,
      matricule: worker.matricule || '',
      telephone: worker.telephone,
      sexe: worker.sexe,
      age: worker.age,
      yearOfBirth: worker.yearOfBirth || (new Date().getFullYear() - worker.age),
      dateNaissance: worker.dateNaissance || '',
      fermeId: worker.fermeId,
      chambre: worker.chambre,
      secteur: worker.secteur,
      statut: worker.statut,
      dateEntree: worker.dateEntree || new Date().toISOString().split('T')[0],
      dateSortie: worker.dateSortie || '',
      motif: worker.motif || 'none',
      supervisorId: worker.supervisorId || '',
      allocatedItems: {
        EPONGE: worker.eponge === 'oui',
        LIT: worker.lit === 'oui'
      }
    });
    setEditingWorker(worker);
    setAutoFilledWorker(''); // Clear auto-fill indicator when editing
    setIsAddDialogOpen(true);
  };

  const handleDelete = async (workerId: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet ouvrier ?')) {
      setLoading(true);
      try {
        // Find the worker to be deleted
        const workerToDelete = allWorkers.find(w => w.id === workerId);
        if (!workerToDelete) {
          throw new Error('Ouvrier non trouvé');
        }

        console.log(`Deleting worker: ${workerToDelete.nom} (CIN: ${workerToDelete.cin})`);

        // Create a batch for atomic updates
        const batch = writeBatch(db);

        // 1. Delete the worker document
        const workerRef = doc(db, 'workers', workerId);
        batch.delete(workerRef);

        // 2. Update room occupancy if worker is assigned to a room
        if (workerToDelete.chambre && workerToDelete.statut === 'actif') {
          const workerRoom = rooms.find(r =>
            r.numero === workerToDelete.chambre &&
            r.fermeId === workerToDelete.fermeId
          );

          if (workerRoom) {
            console.log(` Updating room ${workerRoom.numero} occupancy`);
            const roomRef = doc(db, 'rooms', workerRoom.id);

            // Remove worker from occupants list (try both ID and CIN for compatibility)
            const updatedOccupants = workerRoom.listeOccupants.filter(occupantId =>
              occupantId !== workerToDelete.id && occupantId !== workerToDelete.cin
            );
            const newOccupantsCount = Math.max(0, workerRoom.occupantsActuels - 1);

            // Additional validation: ensure count consistency
            const actualOccupantsCount = updatedOccupants.length;
            const finalOccupantsCount = Math.min(newOccupantsCount, actualOccupantsCount);

            batch.update(roomRef, {
              listeOccupants: updatedOccupants,
              occupantsActuels: finalOccupantsCount,
              updatedAt: new Date()
            });

            console.log(`✅ Room ${workerRoom.numero}: ${workerRoom.occupantsActuels} → ${finalOccupantsCount} occupants (list count: ${actualOccupantsCount})`);

            // Log warning if there was a data inconsistency
            if (newOccupantsCount !== actualOccupantsCount) {
              console.log(`���️ Data inconsistency detected in room ${workerRoom.numero}. Fixed automatically.`);
            }
          } else {
            console.log(`⚠ Room not found for worker ${workerToDelete.nom} (room: ${workerToDelete.chambre})`);
          }
        } else if (workerToDelete.chambre && workerToDelete.statut === 'inactif') {
          console.log(`ℹ️ Worker ${workerToDelete.nom} was already inactive, no room update needed`);
        }

        // 3. Update ferme statistics
        const ferme = fermes.find(f => f.id === workerToDelete.fermeId);
        if (ferme && workerToDelete.statut === 'actif') {
          console.log(`📊 Updating ferme ${ferme.nom} statistics`);
          const fermeRef = doc(db, 'fermes', ferme.id);

          // Recalculate total active workers for this ferme
          const activeWorkersInFerme = allWorkers.filter(w =>
            w.fermeId === workerToDelete.fermeId &&
            w.statut === 'actif' &&
            w.id !== workerId // Exclude the worker being deleted
          ).length;

          batch.update(fermeRef, {
            totalOuvriers: activeWorkersInFerme,
            updatedAt: new Date()
          });

          console.log(`✅ Ferme ${ferme.nom}: updated totalOuvriers to ${activeWorkersInFerme}`);
        }

        // Execute all updates atomically
        await batch.commit();
        console.log(`✅ Successfully deleted worker ${workerToDelete.nom} and updated all related data`);

        // Sync room occupancy to ensure consistency
        try {
          await syncRoomOccupancy();
          console.log('✅ Room occupancy synchronized after worker deletion');
        } catch (syncError) {
          console.warn('⚠️ Room occupancy sync failed after worker deletion:', syncError);
        }

        // Show success message to user
        // Note: In a real app, you might want to use a toast notification library
        setTimeout(() => {
          alert(`✅ Ouvrier ${workerToDelete.nom} supprimé avec succés.\nToutes les données liées (chambres, statistiques) ont été mises à jour.`);
        }, 100);

      } catch (error: any) {
        console.error('❌ Error deleting worker and updating related data:', error);
        setError(error.message || 'Erreur lors de la suppression de l\'ouvrier');

        // Show error to user
        alert(`Erreur lors de la suppression: ${error.message || 'Une erreur inattendue s\'est produite'}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedWorkers.size === 0) return;

    // For farm admins, require security code
    if (!isSuperAdmin) {
      setShowSecurityDialog(true);
      return;
    }

    // For superadmins, proceed directly
    const selectedWorkersArray = allWorkers.filter(w => selectedWorkers.has(w.id));
    const confirmMessage = `étes-vous sûr de vouloir supprimer ${selectedWorkers.size} ouvrier(s) ?\n\nOuvriers sélectionnés:\n${selectedWorkersArray.map(w => `• ${w.nom} (${w.cin})`).join('\n')}`;

    if (window.confirm(confirmMessage)) {
      setLoading(true);
      try {
        console.log(`🗑️ Starting bulk delete of ${selectedWorkers.size} workers...`);

        // Check if we're deleting all active workers
        const deletingAllWorkers = isDeleteAllWorkers(selectedWorkers, allWorkers);
        if (deletingAllWorkers) {
          console.log('🧹 Detected deletion of all active workers - will clear all room occupants');
        }

        // Create a batch for atomic updates
        const batch = writeBatch(db);
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const workerId of selectedWorkers) {
          try {
            const workerToDelete = allWorkers.find(w => w.id === workerId);
            if (!workerToDelete) {
              errors.push(`Ouvrier avec ID ${workerId} non trouvé`);
              errorCount++;
              continue;
            }

            console.log(`️ Processing deletion for: ${workerToDelete.nom} (CIN: ${workerToDelete.cin})`);

            // 1. Delete the worker document
            const workerRef = doc(db, 'workers', workerId);
            batch.delete(workerRef);

            // 2. Update room occupancy if worker is assigned to a room
            if (workerToDelete.chambre && workerToDelete.statut === 'actif') {
              const workerRoom = rooms.find(r =>
                r.numero === workerToDelete.chambre &&
                r.fermeId === workerToDelete.fermeId
              );

              if (workerRoom) {
                const roomRef = doc(db, 'rooms', workerRoom.id);
                const updatedOccupants = workerRoom.listeOccupants.filter(occupantId =>
                  occupantId !== workerToDelete.id && occupantId !== workerToDelete.cin
                );
                const newOccupantsCount = Math.max(0, workerRoom.occupantsActuels - 1);

                batch.update(roomRef, {
                  listeOccupants: updatedOccupants,
                  occupantsActuels: newOccupantsCount,
                  updatedAt: new Date()
                });
              }
            }

            successCount++;
          } catch (error: any) {
            errorCount++;
            errors.push(`${selectedWorkersArray.find(w => w.id === workerId)?.nom || workerId}: ${error.message}`);
            console.error(` Error preparing deletion for worker ${workerId}:`, error);
          }
        }

        // Execute all deletions atomically
        if (successCount > 0) {
          await batch.commit();
          console.log(`✅ Successfully deleted ${successCount} workers`);

          // If we deleted all workers, clear all room occupants for consistency
          if (deletingAllWorkers) {
            try {
              await clearAllRoomOccupants();
              console.log('✅ All room occupants cleared after deleting all workers');
            } catch (clearError) {
              console.warn('⚠️ Failed to clear all room occupants:', clearError);
            }
          } else {
            // Sync room occupancy to ensure consistency
            try {
              await syncRoomOccupancy();
              console.log('✅ Room occupancy synchronized after batch worker deletion');
            } catch (syncError) {
              console.warn('⚠️ Room occupancy sync failed after batch worker deletion:', syncError);
            }
          }
        }

        // Update ferme statistics for affected fermes
        const affectedFermes = new Set(selectedWorkersArray.map(w => w.fermeId));
        for (const fermeId of affectedFermes) {
          try {
            const ferme = fermes.find(f => f.id === fermeId);
            if (ferme) {
              const activeWorkersInFerme = allWorkers.filter(w =>
                w.fermeId === fermeId &&
                w.statut === 'actif' &&
                !selectedWorkers.has(w.id) // Exclude deleted workers
              ).length;

              const fermeRef = doc(db, 'fermes', ferme.id);
              await updateDoc(fermeRef, {
                totalOuvriers: activeWorkersInFerme,
                updatedAt: new Date()
              });
            }
          } catch (error) {
            console.error(`❌ Error updating ferme statistics for ${fermeId}:`, error);
          }
        }

        // Clear selection and show results
        clearSelection();

        if (errorCount > 0) {
          console.warn(`���️ ${errorCount} workers failed to delete:`, errors);
          alert(`Suppression terminée avec quelques erreurs:\n${successCount} réussis, ${errorCount} échoués\n\nErreurs:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`);
        } else {
          alert(`Suppression réussie! ${successCount} ouvrier(s) supprimé(s) avec succès.`);
        }

      } catch (error: any) {
        console.error('❌ Bulk delete failed:', error);
        alert(`Erreur lors de la suppression en masse: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  // Security code verification function
  const verifySecurityCode = async () => {
    if (!securityCode.trim()) {
      setSecurityError('Veuillez entrer un code de sécurité');
      return;
    }

    setLoading(true);
    setSecurityError('');

    try {
      // Query the security code (simplified to avoid composite index)
      const { query, where, getDocs } = await import('firebase/firestore');

      const q = query(
        collection(db, 'bulkDeletionCodes'),
        where('code', '==', securityCode.trim()),
        where('isActive', '==', true)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setSecurityError('Code invalide');
        return;
      }

      // Check expiration client-side
      const codeDoc = querySnapshot.docs[0];
      const codeData = codeDoc.data();
      const expiresAt = codeData.expiresAt.toDate();

      if (expiresAt <= new Date()) {
        setSecurityError('Code expiré');
        return;
      }

      // Check deletion limits
      const maxDeletions = codeData.maxDeletions || 1;
      const deletionsUsed = codeData.deletionsUsed || 0;
      const selectedWorkersCount = selectedWorkers.size;
      const remainingDeletions = maxDeletions - deletionsUsed;

      if (selectedWorkersCount > remainingDeletions) {
        setSecurityError(`Ce code ne peut supprimer que ${remainingDeletions} ouvrier(s) supplémentaire(s). Vous avez sélectionné ${selectedWorkersCount} ouvrier(s). Veuillez réduire votre sélection.`);
        return;
      }

      if (remainingDeletions <= 0) {
        setSecurityError('Ce code a atteint sa limite de suppressions autorisées.');
        return;
      }

      // Code is valid, proceed with deletion
      setShowSecurityDialog(false);
      setSecurityCode('');
      setSecurityError('');

      // Update code usage tracking
      const currentUsageCount = codeData.usageCount || 0;
      const newDeletionsUsed = deletionsUsed + selectedWorkersCount;
      const { serverTimestamp: getServerTimestamp } = await import('firebase/firestore');

      // Check if code should be marked as completely used
      const isCodeFullyUsed = newDeletionsUsed >= maxDeletions;

      await updateDoc(codeDoc.ref, {
        usageCount: currentUsageCount + 1,
        deletionsUsed: newDeletionsUsed,
        isUsed: isCodeFullyUsed,
        isActive: !isCodeFullyUsed,
        usedAt: getServerTimestamp(),
        usedBy: user?.uid
      });

      // Proceed with actual bulk deletion
      await performBulkDeletion();

    } catch (error: any) {
      console.error('Error verifying security code:', error);
      setSecurityError('Erreur lors de la vérification du code');
    } finally {
      setLoading(false);
    }
  };

  // Actual bulk deletion function (extracted from original handleBulkDelete)
  const performBulkDeletion = async () => {
    if (selectedWorkers.size === 0) return;

    const selectedWorkersArray = allWorkers.filter(w => selectedWorkers.has(w.id));
    const confirmMessage = `Êtes-vous sûr de vouloir supprimer ${selectedWorkers.size} ouvrier(s) ?\n\nOuvriers sélectionnés:\n${selectedWorkersArray.map(w => `• ${w.nom} (${w.cin})`).join('\n')}`;

    if (!window.confirm(confirmMessage)) return;

    setLoading(true);
    try {
      console.log(`🗑️ Starting bulk delete of ${selectedWorkers.size} workers...`);

      // Check if we're deleting all active workers
      const deletingAllWorkers = isDeleteAllWorkers(selectedWorkers, allWorkers);
      if (deletingAllWorkers) {
        console.log('🧹 Detected deletion of all active workers - will clear all room occupants');
      }

      // Create a batch for atomic updates
      const batch = writeBatch(db);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const workerId of selectedWorkers) {
        try {
          const workerToDelete = allWorkers.find(w => w.id === workerId);
          if (!workerToDelete) {
            errors.push(`Ouvrier avec ID ${workerId} non trouvé`);
            errorCount++;
            continue;
          }

          console.log(`⚡ Processing deletion for: ${workerToDelete.nom} (CIN: ${workerToDelete.cin})`);

          // 1. Delete the worker document
          const workerRef = doc(db, 'workers', workerId);
          batch.delete(workerRef);

          // 2. Update room occupancy if worker is assigned to a room
          if (workerToDelete.chambre && workerToDelete.statut === 'actif') {
            const workerRoom = rooms.find(r =>
              r.numero === workerToDelete.chambre &&
              r.fermeId === workerToDelete.fermeId
            );

            if (workerRoom) {
              const roomRef = doc(db, 'rooms', workerRoom.id);
              const updatedOccupants = workerRoom.listeOccupants.filter(occupantId =>
                occupantId !== workerToDelete.id && occupantId !== workerToDelete.cin
              );
              const newOccupantsCount = Math.max(0, workerRoom.occupantsActuels - 1);

              batch.update(roomRef, {
                listeOccupants: updatedOccupants,
                occupantsActuels: newOccupantsCount,
                updatedAt: new Date()
              });
            }
          }

          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(`${selectedWorkersArray.find(w => w.id === workerId)?.nom || workerId}: ${error.message}`);
          console.error(`❌ Error preparing deletion for worker ${workerId}:`, error);
        }
      }

      // Execute all deletions atomically
      if (successCount > 0) {
        await batch.commit();
        console.log(`✅ Successfully deleted ${successCount} workers`);

        // If we deleted all workers, clear all room occupants for consistency
        if (deletingAllWorkers) {
          try {
            await clearAllRoomOccupants();
            console.log('✅ All room occupants cleared after deleting all workers');
          } catch (clearError) {
            console.warn('⚠️ Failed to clear all room occupants:', clearError);
          }
        } else {
          // Sync room occupancy to ensure consistency
          try {
            await syncRoomOccupancy();
            console.log('✅ Room occupancy synchronized after batch worker deletion');
          } catch (syncError) {
            console.warn('⚠️ Room occupancy sync failed after batch worker deletion:', syncError);
          }
        }
      }

      // Update ferme statistics for affected fermes
      const affectedFermes = new Set(selectedWorkersArray.map(w => w.fermeId));
      for (const fermeId of affectedFermes) {
        try {
          const ferme = fermes.find(f => f.id === fermeId);
          if (ferme) {
            const activeWorkersInFerme = allWorkers.filter(w =>
              w.fermeId === fermeId &&
              w.statut === 'actif' &&
              !selectedWorkers.has(w.id) // Exclude deleted workers
            ).length;

            const fermeRef = doc(db, 'fermes', ferme.id);
            await updateDoc(fermeRef, {
              totalOuvriers: activeWorkersInFerme,
              updatedAt: new Date()
            });
          }
        } catch (error) {
          console.error(`❌ Error updating ferme statistics for ${fermeId}:`, error);
        }
      }

      // Clear selection and show results
      clearSelection();

      if (errorCount > 0) {
        console.warn(`⚠️ ${errorCount} workers failed to delete:`, errors);
        alert(`Suppression terminée avec quelques erreurs:\n${successCount} réussis, ${errorCount} échoués\n\nErreurs:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`);
      } else {
        alert(`Suppression réussie! ${successCount} ouvrier(s) supprimé(s) avec succès.`);
      }

    } catch (error: any) {
      console.error('❌ Bulk delete failed:', error);
      alert(`Erreur lors de la suppression en masse: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkExport = () => {
    if (selectedWorkers.size === 0) return;

    const selectedWorkersArray = allWorkers.filter(w => selectedWorkers.has(w.id));

    // Prepare data for Excel export
    const exportData = selectedWorkersArray.map(worker => ({
      'Matricule': worker.matricule || '',
      'Nom': worker.nom,
      'CIN': worker.cin,
      'Téléphone': worker.telephone,
      'Sexe': worker.sexe === 'homme' ? 'Homme' : 'Femme',
      'Âge': worker.age,
      'Année de naissance': worker.yearOfBirth || (new Date().getFullYear() - worker.age),
      'Ferme': getFermeName(worker.fermeId),
      'Chambre': worker.chambre,
      'Secteur': worker.secteur || (worker as any).dortoir?.replace('Dortoir', 'Secteur') || '',
      'Superviseur': getSupervisorName(worker.supervisorId),
      'Date d\'entrée': new Date(worker.dateEntree).toLocaleDateString('fr-FR'),
      'Date de sortie': worker.dateSortie ? new Date(worker.dateSortie).toLocaleDateString('fr-FR') : '',
      'Motif de sortie': worker.motif && worker.motif !== 'none' ? worker.motif : '',
      'Statut': worker.statut === 'actif' ? 'Actif' : 'Inactif'
    }));

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Nom
      { wch: 12 }, // CIN
      { wch: 15 }, // Téléphone
      { wch: 8 },  // Sexe
      { wch: 6 },  // Âge
      { wch: 12 }, // Année de naissance
      { wch: 20 }, // Ferme
      { wch: 10 }, // Chambre
      { wch: 15 }, // Secteur
      { wch: 18 }, // Superviseur
      { wch: 12 }, // Date d'entrée
      { wch: 12 }, // Date de sortie
      { wch: 20 }, // Motif
      { wch: 8 }   // Statut
    ];
    worksheet['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ouvriers Sélectionnés');

    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0];
    const filename = `ouvriers_selection_${today}.xlsx`;

    // Save file
    XLSX.writeFile(workbook, filename);

    // Clear selection after export
    clearSelection();
  };

  const handleBulkTransfer = () => {
    if (selectedWorkers.size === 0) return;
    setIsTransferDialogOpen(true);
  };

  const handleCreateWorkerTransfer = async () => {
    if (selectedWorkers.size === 0 || !transferFormData.toFermeId) return;

    try {
      setLoading(true);

      const selectedWorkersArray = allWorkers.filter(w => selectedWorkers.has(w.id));
      const toFerme = fermes.find(f => f.id === transferFormData.toFermeId);
      const fromFerme = fermes.find(f => f.id === user?.fermeId);

      if (!toFerme || !fromFerme) {
        toast({
          title: "Erreur",
          description: "Ferme de destination non trouvée.",
          variant: "destructive",
        });
        return;
      }

      // Create worker transfer document
      const workerTransfer: Omit<WorkerTransfer, 'id'> = {
        fromFermeId: user?.fermeId || '',
        fromFermeName: fromFerme.nom,
        toFermeId: transferFormData.toFermeId,
        toFermeName: toFerme.nom,
        workers: selectedWorkersArray.map(worker => ({
          workerId: worker.id,
          workerName: worker.nom,
          matricule: worker.matricule,
          sexe: worker.sexe,
          currentChambre: worker.chambre,
          currentSecteur: worker.secteur
        })),
        status: 'pending',
        createdAt: new Date(),
        transferredBy: user?.uid || '',
        transferredByName: user?.nom || user?.email || '',
        notes: transferFormData.notes,
        priority: transferFormData.priority,
        trackingNumber: `WT-${Date.now()}`
      };

      // Add to Firestore
      const { addDoc, collection } = await import('firebase/firestore');
      const transferDocRef = await addDoc(collection(db, 'worker_transfers'), workerTransfer);

      // Create notification for receiving farm admin
      const notification = {
        transferId: transferDocRef.id,
        type: 'incoming_worker_transfer',
        fromFermeId: user?.fermeId || '',
        fromFermeName: fromFerme.nom,
        toFermeId: transferFormData.toFermeId,
        toFermeName: toFerme.nom,
        workers: selectedWorkersArray.map(worker => ({
          workerId: worker.id,
          workerName: worker.nom,
          matricule: worker.matricule,
          sexe: worker.sexe
        })),
        workerCount: selectedWorkers.size,
        message: `Transfert de ${selectedWorkers.size} ouvrier(s) de ${fromFerme.nom} vers ${toFerme.nom}`,
        status: 'unread',
        createdAt: new Date(),
        userId: '',
        requiresAction: true,
        priority: transferFormData.priority
      };

      await addDoc(collection(db, 'worker_transfer_notifications'), notification);

      toast({
        title: "Transfert créé",
        description: `Transfert de ${selectedWorkers.size} ouvrier(s) envoyé à ${toFerme.nom}. En attente de confirmation.`,
      });

      // Reset form and close dialog
      setTransferFormData({
        toFermeId: '',
        notes: '',
        priority: 'medium'
      });
      setIsTransferDialogOpen(false);
      clearSelection();

    } catch (error: any) {
      console.error('Error creating worker transfer:', error);
      toast({
        title: "Erreur",
        description: "Erreur lors de la création du transfert.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (worker: Worker) => {
    if (worker.statut === 'actif') {
      return <Badge className="bg-green-100 text-green-800">Actif</Badge>;
    } else {
      if (worker.dateSortie) {
        return <Badge className="bg-orange-100 text-orange-800">Sorti</Badge>;
      } else {
        return <Badge variant="secondary">Inactif</Badge>;
      }
    }
  };

  const getGenderBadge = (sexe: string) => {
    return sexe === 'homme'
      ? <Badge className="bg-blue-100 text-blue-800">Homme</Badge>
      : <Badge className="bg-pink-100 text-pink-800">Femme</Badge>;
  };

  const getFermeName = (fermeId: string) => {
    const ferme = fermes.find(f => f.id === fermeId);
    return ferme?.nom || fermeId;
  };

  const getSupervisorName = (supervisorId: string) => {
    if (!supervisorId) return '-';
    const supervisor = supervisors?.find(s => s.id === supervisorId);
    if (supervisor) {
      return supervisor.company
        ? `${supervisor.nom} (${supervisor.company})`
        : supervisor.nom;
    }
    return supervisorId;
  };

  // Get available chambers for the selected ferme and gender
  const getAvailableChambres = () => {
    if (!formData.fermeId || !formData.sexe) {
      console.log('getAvailableChambres: Missing fermeId or sexe', { fermeId: formData.fermeId, sexe: formData.sexe });
      return [];
    }

    const filtered = rooms.filter(room => {
      const matchesFerme = room.fermeId === formData.fermeId;
      const matchesGender = (formData.sexe === 'homme' && room.genre === 'hommes') ||
        (formData.sexe === 'femme' && room.genre === 'femmes');

      return matchesFerme && matchesGender;
    }).sort((a, b) => parseInt(a.numero) - parseInt(b.numero));

    console.log(`getAvailableChambres: Found ${filtered.length} rooms for ferme ${formData.fermeId} and gender ${formData.sexe}`, {
      totalRooms: rooms.length,
      filteredRooms: filtered.map(r => ({ numero: r.numero, genre: r.genre, fermeId: r.fermeId }))
    });

    return filtered;
  };

  const handleBulkImport = async (workersToImport: Omit<Worker, 'id'>[]) => {
    setLoading(true);
    try {
      console.log(`📥 Starting bulk import of ${workersToImport.length} workers...`);

      const batch = writeBatch(db);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const stockUpdates = new Map<string, number>(); // stockItemId -> quantity to deduct

      for (const workerData of workersToImport) {
        try {
          // Add each worker to the batch
          const newWorkerRef = doc(collection(db, 'workers'));

          // Process allocated items and track stock deductions
          if (workerData.allocatedItems && workerData.allocatedItems.length > 0) {
            // Update allocated items with proper IDs
            const updatedAllocatedItems = workerData.allocatedItems.map(item => ({
              ...item,
              id: `${newWorkerRef.id}_${item.itemName}_${Date.now()}`,
              allocatedBy: user?.uid || 'import-system'
            }));

            // Track stock deductions
            updatedAllocatedItems.forEach(item => {
              const currentDeduction = stockUpdates.get(item.stockItemId) || 0;
              stockUpdates.set(item.stockItemId, currentDeduction + 1);
            });

            workerData.allocatedItems = updatedAllocatedItems;
          }

          batch.set(newWorkerRef, {
            ...workerData,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          // Track room updates for later processing (to avoid conflicts in batch)
          if (workerData.statut === 'actif' && workerData.chambre) {
            console.log(`📋 Worker ${workerData.nom} assigned to room ${workerData.chambre}`);
          }

          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(`${workerData.nom}: ${error.message}`);
          console.error(` Error preparing worker ${workerData.nom}:`, error);
        }
      }

      // Stock quantities remain unchanged - allocation tracking is done via allocatedItems
      // Only update lastUpdated timestamp for affected stock items
      for (const [stockItemId] of stockUpdates) {
        const stockRef = doc(db, 'stocks', stockItemId);
        const currentStock = stocks?.find(s => s.id === stockItemId);
        if (currentStock) {
          batch.update(stockRef, {
            lastUpdated: new Date().toISOString()
          });
          console.log(`�� Stock touched: ${currentStock.item} (no quantity change - tracking via allocations)`);
        }
      }

      // Execute the batch
      await batch.commit();
      console.log(`✅ Successfully imported ${successCount} workers`);

      // Note: Room occupancy will be automatically updated by the room repair system

      if (errorCount > 0) {
        console.warn(`⚠ ${errorCount} workers failed to import:`, errors);
        alert(`Import terminé avec quelques erreurs:\n${successCount} réussis, ${errorCount} échoués`);
      } else {
        alert(`✅ Import réussi! ${successCount} ouvriers importés avec succès.`);
      }

    } catch (error: any) {
      console.error('❌ Bulk import failed:', error);
      alert(`Erreur lors de l'importation: ${error.message}`);
    } finally {
      setLoading(false);
      setIsImportDialogOpen(false);
    }
  };

  const handleExportToExcel = () => {
    // Prepare data for Excel export
    const exportData = filteredWorkers.map(worker => ({
      'Matricule': worker.matricule || '',
      'Nom': worker.nom,
      'CIN': worker.cin,
      'Téléphone': worker.telephone,
      'Sexe': worker.sexe === 'homme' ? 'Homme' : 'Femme',
      'Âge': worker.age,
      'Année de naissance': worker.yearOfBirth || (new Date().getFullYear() - worker.age),
      'Ferme': getFermeName(worker.fermeId),
      'Chambre': worker.chambre,
      'Secteur': worker.secteur || (worker as any).dortoir?.replace('Dortoir', 'Secteur') || '',
      'Superviseur': getSupervisorName(worker.supervisorId),
      'Date d\'entrée': new Date(worker.dateEntree).toLocaleDateString('fr-FR'),
      'Date de sortie': worker.dateSortie ? new Date(worker.dateSortie).toLocaleDateString('fr-FR') : '',
      'Motif de sortie': worker.motif && worker.motif !== 'none' ? worker.motif : '',
      'Statut': worker.statut === 'actif' ? 'Actif' : 'Inactif'
    }));

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Nom
      { wch: 12 }, // CIN
      { wch: 15 }, // Téléphone
      { wch: 8 },  // Sexe
      { wch: 6 },  // Âge
      { wch: 12 }, // Année de naissance
      { wch: 20 }, // Ferme
      { wch: 10 }, // Chambre
      { wch: 15 }, // Secteur
      { wch: 18 }, // Superviseur
      { wch: 12 }, // Date d'entrée
      { wch: 12 }, // Date de sortie
      { wch: 20 }, // Motif
      { wch: 8 }   // Statut
    ];
    worksheet['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ouvriers');

    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0];
    const filename = `ouvriers_${today}.xlsx`;

    // Save file
    XLSX.writeFile(workbook, filename);
  };

  // Automatic cleanup of inactive workers from rooms
  const handleAutoCleanup = async () => {
    setCleanupLoading(true);
    try {
      const updatesNeeded = await syncInactiveWorkersFromRooms(allWorkers, rooms, updateRoom);
      if (updatesNeeded > 0) {
        console.log(`✅ Automatically cleaned ${updatesNeeded} rooms`);
      } else {
        console.log('✅ All rooms are already synchronized');
      }
    } catch (error) {
      console.error('❌ Auto cleanup failed:', error);
    } finally {
      setCleanupLoading(false);
    }
  };

  // Run auto cleanup when component loads or when workers/rooms data changes
  useEffect(() => {
    if (allWorkers.length > 0 && rooms.length > 0 && updateRoom) {
      const timeoutId = setTimeout(() => {
        handleAutoCleanup();
      }, 2000); // Run cleanup after 2 seconds

      return () => clearTimeout(timeoutId);
    }
  }, [allWorkers, rooms, updateRoom]);

  // Initialize form data when dialog opens for new worker
  useEffect(() => {
    if (isAddDialogOpen && !editingWorker) {
      // Only reset form if it's completely empty or if we're opening for a new worker
      // Preserve any existing date entries to avoid overriding user selections
      if (!formData.nom && !formData.cin) {
        setFormData(prevFormData => ({
          nom: '',
          cin: '',
          telephone: '',
          sexe: 'homme',
          age: 25,
          yearOfBirth: new Date().getFullYear() - 25,
          dateNaissance: '',
          fermeId: user?.fermeId || '',
          chambre: '',
          secteur: '',
          statut: 'actif',
          dateEntree: prevFormData.dateEntree || new Date().toISOString().split('T')[0], // Preserve existing date or default to today
          dateSortie: '',
          motif: 'none',
          supervisorId: '',
          allocatedItems: {
            EPONGE: false,
            LIT: false
          }
        }));
      }
    }
  }, [isAddDialogOpen, editingWorker, user?.fermeId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>

        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          {false && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  console.log('🔍 Starting Firestore rules verification...');

                  if (!user?.uid) {
                    alert('❌ Erreur: Utilisateur non connecté');
                    return;
                  }

                  try {
                    const { verifyFirestoreRulesDeployment, testNotificationPermissions } = await import('@/utils/verifyFirestoreRules');

                    // Step 1: Verify basic Firestore rules
                    console.log('📋 Testing basic Firestore rules...');
                    const rulesResult = await verifyFirestoreRulesDeployment(user.uid);

                    if (!rulesResult.success) {
                      alert(`�� RÈGLES FIRESTORE NON DÉPLOYÉES!\n\n` +
                        `Erreur: ${rulesResult.error}\n\n` +
                        `Solution: ${rulesResult.solution}\n\n` +
                        `URGENT: Déployez les règles via Firebase Console!`);
                      return;
                    }

                    // Step 2: Test notification-specific permissions
                    console.log('🔔 Testing notification permissions...');
                    const notificationResult = await testNotificationPermissions(user.uid, user.fermeId || '');

                    if (notificationResult.success) {
                      alert(` FIRESTORE RULES DÉPLOYÉES AVEC SUCCÈS!\n\n` +
                        `• Règles de base: ✅ Fonctionnelles\n` +
                        `• Permissions notifications: ✅ Fonctionnelles\n\n` +
                        `Vous pouvez maintenant utiliser le système de notifications!`);
                    } else {
                      alert(`⚠️ Règles partiellement déployées\n\n` +
                        `• Règles de base: ✅ OK\n` +
                        `• Notifications: ❌ ${notificationResult.error}\n\n` +
                        `Vérifiez la console pour plus de détails.`);
                    }
                  } catch (error) {
                    console.error('Rules verification failed:', error);
                    alert(`❌ RÈGLES NON DÉPLOYÉES!\n\n` +
                      `Erreur: ${error}\n\n` +
                      `URGENT: Déployez les règles Firestore via Firebase Console!`);
                  }
                }}
                className="text-red-600 hover:text-red-700 border-red-200"
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Verify Rules
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  console.log('���� Starting comprehensive notification test...');

                  if (!user?.uid) {
                    alert('❌ Erreur: Utilisateur non connecté');
                    return;
                  }

                  try {
                    console.log(' User details:', {
                      uid: user.uid,
                      email: user.email,
                      nom: user.nom,
                      fermeId: user.fermeId
                    });

                    // Step 1: Test basic Firestore connectivity
                    console.log('🔥 Testing Firestore connectivity...');
                    const { testNotificationCreation, debugNotificationPermissions } = await import('@/utils/testNotificationCreation');

                    const hasPermissions = await debugNotificationPermissions();
                    if (!hasPermissions) {
                      alert('⚠️ Firestore permissions manquantes. Déployez les règles Firestore!');
                      return;
                    }

                    // Step 2: Test direct notification creation
                    console.log('📤 Testing direct notification creation...');
                    const notificationId = await testNotificationCreation(user.uid, user.fermeId || '');

                    if (notificationId) {
                      // Step 3: Test sending to another user (simulate cross-farm notification)
                      console.log('Testing cross-user notification...');

                      // Find another user from different farm to test with
                      const otherFarms = fermes.filter(f => f.id !== user.fermeId);
                      if (otherFarms.length > 0 && otherFarms[0].admins && otherFarms[0].admins.length > 0) {
                        const testAdminId = otherFarms[0].admins[0];
                        console.log(`📤 Sending test notification to admin: ${testAdminId} of farm: ${otherFarms[0].nom}`);

                        const crossNotificationResult = await sendNotification({
                          type: 'worker_duplicate',
                          title: ' TEST - Notification inter-ferme',
                          message: `Test de notification envoyée de ${fermes.find(f => f.id === user.fermeId)?.nom || 'votre ferme'} vers ${otherFarms[0].nom}`,
                          recipientId: testAdminId,
                          recipientFermeId: otherFarms[0].id,
                          status: 'unread',
                          priority: 'urgent',
                          actionData: {
                            actionRequired: 'Test de notification inter-ferme',
                            actionUrl: '/workers'
                          }
                        });

                        alert(`✅ Notifications créées avec succès!\n\n` +
                          `1. Notification personnelle: ${notificationId}\n` +
                          `2. Notification inter-ferme: ${crossNotificationResult || 'Échec'}\n\n` +
                          `Vérifiez:\n` +
                          `• Console Firebase (collection 'notifications')\n` +
                          `• Cloche de notification dans l'app\n` +
                          `• Connectez-vous avec l'admin de ${otherFarms[0].nom} pour voir la notification`);
                      } else {
                        alert(`✅ Notification personnelle créée: ${notificationId}\n\n` +
                          `⚠Pas d'autres fermes trouvées pour tester les notifications inter-fermes\n\n` +
                          `Vérifiez Firebase Console pour voir la notification.`);
                      }
                    } else {
                      alert(' Échec de création de notification');
                    }
                  } catch (error) {
                    console.error('Test failed:', error);
                    alert(`❌ Test échoué: ${error}`);
                  }
                }}
                className="text-red-600 hover:text-red-700 border-red-200"
              >
                <Bell className="mr-2 h-4 w-4" />
                Test Basic
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  console.log('🎯 Starting worker conflict simulation...');

                  if (!user?.uid) {
                    alert('❌ Erreur: Utilisateur non connecté');
                    return;
                  }

                  try {
                    const { simulateWorkerConflict } = await import('@/utils/testWorkerConflict');

                    const result = await simulateWorkerConflict(
                      user,
                      sendNotification,
                      allWorkers,
                      fermes
                    );

                    if (result.success) {
                      alert(` Simulation réussie!\n\nTravailleur testé: ${result.testWorker}\nFerme: ${result.testFarm}\nNotifications envoyées: ${result.adminCount}\n\nVérifiez la collection 'notifications' dans Firebase!`);
                    } else {
                      alert(`⚠ Simulation impossible: ${result.reason}`);
                    }
                  } catch (error) {
                    console.error('Worker conflict simulation failed:', error);
                    alert(`❌ Simulation échouée: ${error}`);
                  }
                }}
                className="text-purple-600 hover:text-purple-700 border-purple-200"
              >
                <Users className="mr-2 h-4 w-4" />
                Test Conflict
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  console.log('📊 Checking notification reception...');

                  if (!user?.uid) {
                    alert('❌ Erreur: Utilisateur non connecté');
                    return;
                  }

                  try {
                    const { checkNotificationsForUser, checkAllNotifications } = await import('@/utils/testNotificationReception');

                    // Check notifications for current user
                    const userNotifications = await checkNotificationsForUser(user.uid);

                    // Check all notifications in database
                    const allNotifications = await checkAllNotifications();

                    alert(`�� Résultats de vérification:\n\n` +
                      `• Vos notifications: ${userNotifications.count}\n` +
                      `• Total dans la base: ${allNotifications.total}\n` +
                      `• Utilisateurs avec notifications: ${Object.keys(allNotifications.byRecipient).length}\n\n` +
                      `Voir console pour détails complets.`);

                  } catch (error) {
                    console.error('Notification check failed:', error);
                    alert(`❌ Vérification échou��e: ${error}`);
                  }
                }}
                className="text-yellow-600 hover:text-yellow-700 border-yellow-200"
              >
                <Search className="mr-2 h-4 w-4" />
                Check Reception
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  console.log('🏢 Debugging farm admin data...');

                  try {
                    const { debugFarmAdminData, checkSpecificFarmAdmins } = await import('@/utils/debugFarmAdmins');

                    // Debug all farm admin data
                    const debugResult = await debugFarmAdminData();

                    // Check current user's farm specifically
                    let currentFarmAdmins = null;
                    if (user?.fermeId) {
                      currentFarmAdmins = await checkSpecificFarmAdmins(user.fermeId);
                    }

                    alert(`🏢 Analyse des administrateurs de ferme:\n\n` +
                      `• Total fermes: ${debugResult.summary.totalFarms}\n` +
                      `• Fermes avec admins: ${debugResult.summary.farmsWithAdmins}\n` +
                      `• Total assignments admin: ${debugResult.summary.totalAdminAssignments}\n` +
                      ` Utilisateurs admin: ${debugResult.summary.adminUsers}\n\n` +
                      `${currentFarmAdmins ?
                        `Votre ferme "${currentFarmAdmins.farmName}":\n• Admins: ${currentFarmAdmins.adminCount}` :
                        'Votre ferme: Non trouvée'}\n\n` +
                      `Voir console pour détails complets.`);

                  } catch (error) {
                    console.error('Farm admin debug failed:', error);
                    alert(`❌ Debug ferme échoué: ${error}`);
                  }
                }}
                className="text-orange-600 hover:text-orange-700 border-orange-200"
              >
                <Building className="mr-2 h-4 w-4" />
                Debug Farms
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  console.log('🔧 Debugging MY farm admin assignment...');

                  if (!user?.uid) {
                    alert('❌ Erreur: Utilisateur non connecté');
                    return;
                  }

                  try {
                    const { debugCurrentUserFarmAdmin, fixUserFarmAdminAssignment } = await import('@/utils/debugUserFarmAdmin');

                    const debugResult = await debugCurrentUserFarmAdmin(user);

                    if (debugResult.success) {
                      alert(`✅ Configuration correcte!\n\n` +
                        `• Ferme: ${debugResult.farmName}\n` +
                        `• Admins totaux: ${debugResult.adminCount}\n` +
                        `• Votre UID est dans les admins: ✅\n\n` +
                        `Le système de notification devrait fonctionner.`);
                    } else {
                      const fixResult = await fixUserFarmAdminAssignment(user);

                      alert(`❌ PROBLÈME DÉTECTé!\n\n` +
                        `Erreur: ${debugResult.error}\n\n` +
                        `SOLUTION REQUISE:\n` +
                        `1. Allez dans Firebase Console → Firestore\n` +
                        `2. Trouvez le document ferme: ${user.fermeId}\n` +
                        `3. Ajoutez votre UID dans le champ "admins": ["${user.uid}"]\n` +
                        `4. Sauvegardez le document\n\n` +
                        `Voir console pour plus de détails.`);
                    }

                  } catch (error) {
                    console.error('User farm admin debug failed:', error);
                    alert(`❌ Debug échoué: ${error}`);
                  }
                }}
                className="text-red-600 hover:text-red-700 border-red-200"
              >
                <Users className="mr-2 h-4 w-4" />
                Check My Admin
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  console.log('🔧 Auto-fixing farm admin assignment...');

                  if (!user?.uid) {
                    alert('❌ Erreur: Utilisateur non connecté');
                    return;
                  }

                  if (!confirm(`🔧 CORRECTION AUTOMATIQUE\n\nCeci va ajouter votre UID (${user.uid}) au champ "admins" de votre ferme (${user.fermeId}).\n\nContinuer?`)) {
                    return;
                  }

                  try {
                    const { autoFixUserFarmAdmin, verifyFarmAdminFix } = await import('@/utils/autoFixFarmAdmin');

                    console.log('🔧 Attempting auto-fix...');
                    const fixResult = await autoFixUserFarmAdmin(user);

                    if (fixResult.success) {
                      // Verify the fix worked
                      const verifyResult = await verifyFarmAdminFix(user);

                      if (verifyResult.success) {
                        alert(` CORRECTION RÉUSSIE!\n\n` +
                          `• Ferme: ${fixResult.farmName}\n` +
                          `• Votre UID ajouté aux admins: \n` +
                          `• Admins totaux: ${fixResult.updatedAdmins.length}\n\n` +
                          `Le système de notification devrait maintenant fonctionner!\n\n` +
                          `Essayez de créer un conflit d'ouvrier pour tester.`);
                      } else {
                        alert(`⚠ Correction appliquée mais vérification échouée\n\nVoir console pour détails.`);
                      }
                    } else {
                      alert(` Correction échouée\n\nVoir console pour détails.`);
                    }

                  } catch (error) {
                    console.error('Auto-fix failed:', error);
                    alert(`❌ Correction automatique échouée: ${error}\n\nUtilisez la correction manuelle via Firebase Console.`);
                  }
                }}
                className="text-green-600 hover:text-green-700 border-green-200"
              >
                <Check className="mr-2 h-4 w-4" />
                Auto Fix Admin
              </Button>
            </>
          )}

          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            disabled={loading}
            className="text-green-600 hover:text-green-700 border-green-200 h-12 text-base w-full sm:w-auto"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600 mr-2"></div>
            ) : (
              <Upload className="mr-2 h-5 w-5" />
            )}
            Importer Excel
          </Button>
          <Button variant="outline" onClick={handleExportToExcel} className="h-12 text-base w-full sm:w-auto">
            <Download className="mr-2 h-5 w-5" />
            Exporter Excel
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 h-12 text-base w-full sm:w-auto"
                onClick={() => {
                  setEditingWorker(null);
                  // Don't reset the form data here to preserve selected dates
                  // Only reset when actually opening the dialog or after successful submission
                  setError('');
                  setAutoFilledWorker(''); // Clear auto-fill indicator for new worker
                }}
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Nouvel ouvrier
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[98vw] max-w-2xl mx-1 sm:mx-auto max-h-[95vh] overflow-y-auto mobile-safe-area mobile-dialog-container">
              <DialogHeader className="space-y-3 pb-6 border-b border-gray-100 mobile-dialog-header">
                <DialogTitle className="text-2xl font-semibold text-gray-900 flex items-center">
                  <UserPlus className="mr-3 h-6 w-6 text-blue-600" />
                  {editingWorker ? 'Modifier l\'ouvrier' : 'Nouvel ouvrier'}
                  {autoEditContext && editingWorker && (
                    <Badge className="ml-3 bg-blue-100 text-blue-800 text-sm">
                      Mode automatique
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-gray-600 text-base">
                  {autoEditContext && editingWorker ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">🤖</span>
                        <span>Mode automatique activé: Ajoutez la date de sortie pour résoudre le conflit</span>
                      </div>
                      <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                        Une notification sera envoyée à {autoEditContext.requesterName || 'l\'administrateur demandeur'} une fois la date confirmée
                      </div>
                    </div>
                  ) : (
                    editingWorker ? 'Modifiez les informations de l\'ouvrier' : 'Remplissez les informations de l\'ouvrier'
                  )}
                </DialogDescription>
              </DialogHeader>

              {/* Worker Information Card (when editing) */}
              {editingWorker && (
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-blue-800 text-base flex items-center">
                      <UserIcon className="mr-2 h-4 w-4" />
                      Informations de l'ouvrier
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Nom:</span> {editingWorker.nom}
                      </div>
                      <div>
                        <span className="font-medium">CIN:</span> {editingWorker.cin}
                      </div>
                      <div>
                        <span className="font-medium">Téléphone:</span> {editingWorker.telephone}
                      </div>
                      <div>
                        <span className="font-medium">Statut:</span>
                        <Badge className={`ml-2 ${editingWorker.statut === 'actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {editingWorker.statut}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">Date d'entrée:</span> {new Date(editingWorker.dateEntree).toLocaleDateString('fr-FR')}
                      </div>
                      <div>
                        <span className="font-medium">Date de sortie:</span>
                        {editingWorker.dateSortie ? (
                          new Date(editingWorker.dateSortie).toLocaleDateString('fr-FR')
                        ) : (
                          <span className="text-gray-500 ml-1">Non définie</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <form onSubmit={handleSubmit} className="space-y-8 px-6 pb-2.5">
                <div className="space-y-2">
                  <Label htmlFor="matricule">Matricule</Label>
                  <Input
                    id="matricule"
                    value={formData.matricule || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, matricule: e.target.value }))}
                    placeholder="Ex: 64045"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nom">Nom complet</Label>
                  <Input
                    id="nom"
                    value={formData.nom || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
                    placeholder="Ex: Ahmed Alami"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cin">CIN</Label>
                  <Input
                    id="cin"
                    value={formData.cin || ''}
                    onChange={(e) => handleCinChange(e.target.value)}
                    placeholder="Ex: AA123456"
                    required
                  />
                  {autoFilledWorker && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-center text-sm text-green-700">
                        <Check className="mr-1 h-4 w-4" />
                        <span>Données auto-remplies pour: <strong>{autoFilledWorker}</strong></span>
                      </div>
                      <p className="text-xs text-green-600 mt-1">
                        Ouvrier inactif détecté - prêt pour réactivation
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telephone">Téléphone</Label>
                  <Input
                    id="telephone"
                    value={formData.telephone || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, telephone: e.target.value }))}
                    placeholder="Ex: 0612345678"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sexe</Label>
                    <Select
                      value={formData.sexe}
                      onValueChange={(value: 'homme' | 'femme') => {
                        console.log(`Gender changed to: ${value}`);
                        setFormData(prev => ({
                          ...prev,
                          sexe: value,
                          chambre: '', // Clear chamber when gender changes
                          secteur: ''  // Clear secteur when gender changes
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homme">Homme</SelectItem>
                        <SelectItem value="femme">Femme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateNaissance">Date de naissance</Label>
                    <Input
                      id="dateNaissance"
                      type="date"
                      value={formData.dateNaissance || ''}
                      onChange={(e) => {
                        const dateNaissance = e.target.value;
                        const age = calculateAgeFromDate(dateNaissance);
                        const year = dateNaissance ? new Date(dateNaissance).getFullYear() : new Date().getFullYear() - 25;
                        setFormData(prev => ({
                          ...prev,
                          dateNaissance: dateNaissance,
                          age: age,
                          yearOfBirth: year
                        }));
                      }}
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      min="1950-01-01"
                      required
                    />
                    <p className="text-xs text-gray-500">Âge calculé: {formData.age} ans</p>
                  </div>
                </div>
                {isSuperAdmin && (
                  <div className="space-y-2">
                    <Label>Ferme</Label>
                    <Select
                      value={formData.fermeId}
                      onValueChange={(value) =>
                        setFormData(prev => ({
                          ...prev,
                          fermeId: value,
                          chambre: '', // Clear chamber when farm changes
                          secteur: ''  // Clear secteur when farm changes
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une ferme" />
                      </SelectTrigger>
                      <SelectContent>
                        {fermes.map(ferme => (
                          <SelectItem key={ferme.id} value={ferme.id}>
                            {ferme.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Chambre</Label>
                    <Select
                      value={formData.chambre}
                      onValueChange={(value) => {
                        // Find the selected room from the available chambers (already filtered by ferme and gender)
                        const availableChambres = getAvailableChambres();
                        const selectedRoom = availableChambres.find(room => room.numero === value);
                        setFormData(prev => ({
                          ...prev,
                          chambre: value,
                          secteur: selectedRoom ? (selectedRoom.genre === 'hommes' ? 'Secteur Hommes' : 'Secteur Femmes') : ''
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une chambre" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableChambres().length === 0 ? (
                          <div className="p-2 text-center text-sm text-gray-500">
                            {!formData.fermeId ? 'Sélectionnez d\'abord une ferme' :
                              !formData.sexe ? 'Sélectionnez d\'abord le sexe' :
                                'Aucune chambre disponible pour ce genre'}
                          </div>
                        ) : (
                          getAvailableChambres().map(room => {
                            const isAvailable = room.occupantsActuels < room.capaciteTotale;
                            const availableSpaces = room.capaciteTotale - room.occupantsActuels;
                            return (
                              <SelectItem
                                key={room.id}
                                value={room.numero}
                                disabled={!isAvailable && !editingWorker}
                              >
                                Chambre {room.numero} ({availableSpaces}/{room.capaciteTotale} places) - {room.genre}
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                    {formData.fermeId && formData.sexe && getAvailableChambres().length === 0 && (
                      <Alert className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          Aucune chambre {formData.sexe === 'homme' ? 'pour hommes' : 'pour femmes'} disponible dans cette ferme.
                          <br />
                          <span className="text-xs text-gray-600">
                            Vérifiez que des chambres ont été créées pour ce genre dans cette ferme.
                          </span>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secteur">Secteur</Label>
                    <Input
                      id="secteur"
                      value={formData.secteur || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, secteur: e.target.value }))}
                      placeholder="Sera rempli automatiquement"
                      readOnly
                      className="bg-gray-50"
                    />
                  </div>
                </div>

                {/* Supervisor Selection */}
                <SupervisorSelect
                  value={formData.supervisorId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, supervisorId: value }))}
                  disabled={loading}
                />

                {/* Allocation d'articles */}
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-blue-800 text-base flex items-center">
                      <Package className="mr-2 h-4 w-4" />
                      Allocation d'articles
                    </CardTitle>
                    <p className="text-sm text-blue-700">
                      Sélectionnez les articles à allouer à ce travailleur
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {['EPONGE', 'LIT'].map((itemName) => {
                      const stockCounts = getStockCounts(itemName, formData.fermeId || user?.fermeId || '');
                      return (
                        <div key={itemName} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Checkbox
                              id={`item-${itemName}`}
                              checked={formData.allocatedItems[itemName] || false}
                              onCheckedChange={(checked) => handleItemAllocation(itemName, !!checked)}
                              disabled={stockCounts.available <= 0 && !formData.allocatedItems[itemName]}
                            />
                            <Label htmlFor={`item-${itemName}`} className="font-medium">
                              {itemName}
                            </Label>
                          </div>
                          <div className="text-sm text-right">
                            <div className="text-green-600 font-medium">
                              Disponible: {stockCounts.available}
                            </div>
                            <div className="text-gray-500">
                              Utilisé: {stockCounts.used} / Total: {stockCounts.total}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Date d'entrée */}
                <div className="space-y-2">
                  <Label htmlFor="dateEntree">Date d'entrée</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="dateEntree"
                      type="date"
                      value={formData.dateEntree || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, dateEntree: e.target.value }))}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Exit fields - only show when editing */}
                {editingWorker && (
                  <Card className="border-orange-200 bg-orange-50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-orange-800 text-base flex items-center">
                        <Calendar className="mr-2 h-4 w-4" />
                        Gestion de sortie
                      </CardTitle>
                      <p className="text-sm text-orange-700">
                        Ajoutez une date de sortie pour libérer cet ouvrier. Une notification sera envoyée aux autres fermes.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="dateSortie">Date de sortie (optionnel)</Label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            id="dateSortie"
                            type="date"
                            value={formData.dateSortie || ''}
                            onChange={(e) => {
                              const newDateSortie = e.target.value;
                              setFormData(prev => ({
                                ...prev,
                                dateSortie: newDateSortie,
                                // Automatically set status to inactif when exit date is added
                                statut: newDateSortie ? 'inactif' : 'actif'
                              }));
                            }}
                            className="pl-10"
                            min={formData.dateEntree}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="motif">Motif de sortie (optionnel)</Label>
                          <Select
                            value={formData.motif}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, motif: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner un motif" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Aucun motif</SelectItem>
                              <SelectItem value="fin_contrat">Fin de contrat</SelectItem>
                              <SelectItem value="demission">Démission</SelectItem>
                              <SelectItem value="licenciement">Licenciement</SelectItem>
                              <SelectItem value="mutation">Mutation</SelectItem>
                              <SelectItem value="retraite">Retraite</SelectItem>
                              <SelectItem value="opportunite_salariale">Opportunité salariale</SelectItem>
                              <SelectItem value="absences_frequentes">Absences fréquentes</SelectItem>
                              <SelectItem value="comportement">Comportement</SelectItem>
                              <SelectItem value="salaire">Raisons salariales</SelectItem>
                              <SelectItem value="depart_volontaire">Départ volontaire</SelectItem>
                              <SelectItem value="horaires_nocturnes">Horaires nocturnes</SelectItem>
                              <SelectItem value="adaptation_difficile">Adaptation difficile</SelectItem>
                              <SelectItem value="etudes">Étudiant</SelectItem>
                              <SelectItem value="heures_insuffisantes">Heures insuffisantes</SelectItem>
                              <SelectItem value="distance">Distance</SelectItem>
                              <SelectItem value="indiscipline">Indiscipline</SelectItem>
                              <SelectItem value="maladie">Maladie</SelectItem>
                              <SelectItem value="respect_voisins">Respect des voisins</SelectItem>
                              <SelectItem value="nature_travail">Nature du travail</SelectItem>
                              <SelectItem value="sante">Santé</SelectItem>
                              <SelectItem value="securite">Sécurité</SelectItem>
                              <SelectItem value="rendement">Rendement</SelectItem>
                              <SelectItem value="problemes_personnels">Problèmes personnels</SelectItem>
                              <SelectItem value="caporal">Raison de caporal</SelectItem>
                              <SelectItem value="refus_poste">Refus de poste</SelectItem>
                              <SelectItem value="rejet_selection">Rejet lors de la sélection</SelectItem>
                              <SelectItem value="repos_temporaire">Repos temporaire</SelectItem>
                              <SelectItem value="secteur_insatisfaisant">Secteur insatisfaisant</SelectItem>
                              <SelectItem value="pas_reponse">Pas de réponse</SelectItem>
                              <SelectItem value="conditions_secteur">Conditions du secteur</SelectItem>
                              <SelectItem value="raisons_personnelles">Raisons personnelles</SelectItem>
                              <SelectItem value="autre">Autre</SelectItem>
                            </SelectContent>
                          </Select>
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
                          {formData.dateSortie && formData.statut === 'actif' && (
                            <p className="text-xs text-orange-600">
                              ️ Statut actif avec date de sortie - vérifiez si c'est correct
                            </p>
                          )}
                          {formData.dateSortie && formData.statut === 'inactif' && (
                            <p className="text-xs text-green-600">
                              ✅ Statut automatiquement défini comme inactif
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" type="button" onClick={() => setIsAddDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600"
                  >
                    {loading ? 'Sauvegarde...' : (editingWorker ? 'Modifier' : 'Ajouter')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Transaction History Dialog */}
          <Dialog open={!!viewHistoryWorker} onOpenChange={() => setViewHistoryWorker(null)}>
            <DialogContent className="w-[98vw] max-w-6xl max-h-[95vh] overflow-y-auto sm:w-full p-3 sm:p-6 m-1 sm:m-0 mobile-dialog-container">
              <DialogHeader className="mobile-dialog-header">
                <DialogTitle className="flex items-center">
                  <Clock className="mr-2 h-5 w-5" />
                  Historique des transactions - {viewHistoryWorker?.nom}
                </DialogTitle>
                <DialogDescription>
                  Détail de chaque transaction d'entrée et de sortie avec calcul des jours
                </DialogDescription>
              </DialogHeader>

              {viewHistoryWorker && (() => {
                // Get fresh worker data from the current workers list to avoid stale data
                const freshWorkerData = allWorkers.find(w => w.id === viewHistoryWorker.id) || viewHistoryWorker;

                // Professional transaction history generator
                const getAllTransactionsAndPeriods = () => {
                  const periods = [];
                  const transactions = [];
                  let totalDays = 0;

                  // Step 1: Collect all work periods from different sources
                  const allPeriods = [];

                  // Primary source: workHistory array (if exists and has data)
                  if (freshWorkerData.workHistory && freshWorkerData.workHistory.length > 0) {
                    allPeriods.push(...freshWorkerData.workHistory);
                  }

                  // Fallback/Current source: main worker record
                  // Only add main worker record if it represents a truly new/different period
                  if (freshWorkerData.dateEntree) {
                    // Check if a period with the same entry date already exists in work history
                    const hasEntryDateInHistory = allPeriods.some(period =>
                      period.dateEntree === freshWorkerData.dateEntree
                    );

                    // Only add the main worker record if:
                    // 1. No period with this entry date exists in work history, OR
                    // 2. This is an active worker (no exit date) and it's not already represented
                    const shouldAddMainRecord = !hasEntryDateInHistory ||
                      (!freshWorkerData.dateSortie && freshWorkerData.statut === 'actif');

                    if (shouldAddMainRecord && !hasEntryDateInHistory) {
                      allPeriods.push({
                        id: `current_${Date.now()}`,
                        dateEntree: freshWorkerData.dateEntree,
                        dateSortie: freshWorkerData.dateSortie,
                        motif: freshWorkerData.motif,
                        chambre: freshWorkerData.chambre,
                        secteur: freshWorkerData.secteur,
                        fermeId: freshWorkerData.fermeId
                      });
                    }
                  }

                  // Step 2: Remove duplicates and sort all periods by entry date (oldest first)
                  // Store original for debugging
                  const originalPeriods = [...allPeriods];

                  // Create a Map to deduplicate by entry date (keeping the most complete record)
                  const periodMap = new Map();

                  allPeriods.forEach(period => {
                    const entryDate = period.dateEntree;
                    const existing = periodMap.get(entryDate);

                    if (!existing) {
                      // No existing period with this entry date, add it
                      periodMap.set(entryDate, period);
                    } else {
                      // Period with this entry date exists, keep the more complete one
                      // Prefer periods with exit dates and motifs (more complete historical records)
                      const isMoreComplete = period.dateSortie && period.motif &&
                        (!existing.dateSortie || !existing.motif);

                      if (isMoreComplete) {
                        periodMap.set(entryDate, period);
                      }
                    }
                  });

                  // Convert back to array and sort by entry date
                  const sortedPeriods = Array.from(periodMap.values()).sort((a, b) =>
                    new Date(a.dateEntree).getTime() - new Date(b.dateEntree).getTime()
                  );

                  // Step 3: Process each period and generate transactions
                  sortedPeriods.forEach((period, index) => {
                    const periodNumber = index + 1;
                    const entryDate = new Date(period.dateEntree);

                    // Calculate period end date and days
                    let exitDate = null;
                    let isActive = false;
                    let days = 0;

                    if (period.dateSortie) {
                      exitDate = new Date(period.dateSortie);
                      days = Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
                    } else {
                      // Active period - calculate days until today
                      exitDate = new Date();
                      days = Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
                      isActive = true;
                    }

                    // Ensure days is never negative
                    days = Math.max(0, days);
                    totalDays += days;

                    // Create entry transaction
                    const entryTransaction = {
                      type: 'entry',
                      date: period.dateEntree,
                      chambre: period.chambre || '-',
                      secteur: period.secteur || '-',
                      fermeId: period.fermeId,
                      periodIndex: periodNumber,
                      motif: null,
                      periodInfo: `Début période ${periodNumber}`
                    };

                    transactions.push(entryTransaction);

                    // Create exit transaction (if period is completed)
                    let exitTransaction = null;
                    if (period.dateSortie) {
                      exitTransaction = {
                        type: 'exit',
                        date: period.dateSortie,
                        chambre: period.chambre || '-',
                        secteur: period.secteur || '-',
                        fermeId: period.fermeId,
                        periodIndex: periodNumber,
                        motif: period.motif || 'none',
                        periodInfo: `Fin période ${periodNumber}`
                      };

                      transactions.push(exitTransaction);
                    }

                    // Create period summary
                    periods.push({
                      periodNumber,
                      entryTransaction,
                      exitTransaction,
                      entryDate: period.dateEntree,
                      exitDate: period.dateSortie,
                      days,
                      isActive,
                      chambre: period.chambre,
                      secteur: period.secteur,
                      fermeId: period.fermeId,
                      motif: period.motif
                    });
                  });

                  return {
                    transactions: transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
                    periods,
                    totalDays,
                    totalPeriods: periods.length,
                    debugInfo: {
                      allPeriodsBeforeDedup: originalPeriods,
                      sortedPeriodsAfterDedup: sortedPeriods,
                      duplicatesRemoved: originalPeriods.length - sortedPeriods.length
                    }
                  };
                };

                const { transactions, periods, totalDays, totalPeriods, debugInfo } = getAllTransactionsAndPeriods();

                // Debug information
                console.log('🔍 Worker History Debug:', {
                  workerName: freshWorkerData.nom,
                  hasWorkHistory: !!(freshWorkerData.workHistory && freshWorkerData.workHistory.length > 0),
                  workHistoryLength: freshWorkerData.workHistory?.length || 0,
                  workHistoryData: freshWorkerData.workHistory,
                  mainDateEntree: freshWorkerData.dateEntree,
                  mainDateSortie: freshWorkerData.dateSortie,
                  mainStatut: freshWorkerData.statut,
                  ...debugInfo,
                  calculatedTransactions: transactions.length,
                  calculatedPeriods: totalPeriods,
                  calculatedTotalDays: totalDays,
                  periodsDetails: periods
                });

                return (
                  <div className="space-y-6">
                    {/* Summary Statistics */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{transactions.length}</p>
                            <p className="text-sm text-gray-600">Total transactions</p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{totalPeriods}</p>
                            <p className="text-sm text-gray-600">Périodes de travail</p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{totalDays}</p>
                            <p className="text-sm text-gray-600">Total jours travaillés</p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <div className="text-center">
                            <p className={`text-2xl font-bold ${freshWorkerData.statut === 'actif' ? 'text-green-600' : 'text-red-600'}`}>
                              {freshWorkerData.statut === 'actif' ? 'Actif' : 'Inactif'}
                            </p>
                            <p className="text-sm text-gray-600">Statut actuel</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Timeline Summary */}
                    <Card className="bg-blue-50 border-blue-200">
                      <CardHeader>
                        <CardTitle className="text-blue-800">Résumé chronologique</CardTitle>
                        <div className="text-sm text-blue-600">
                          Aperçu de toutes les périodes d'emploi avec dates et durées
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {periods.map((period, index) => (
                            <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white rounded-lg border">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-blue-600">
                                  Période {period.periodNumber}
                                </Badge>
                                <div>
                                  <div className="font-medium">
                                    {new Date(period.entryDate).toLocaleDateString('fr-FR')}
                                    {period.exitDate && (
                                      <span>  {new Date(period.exitDate).toLocaleDateString('fr-FR')}</span>
                                    )}
                                    {!period.exitDate && <span className="text-green-600"> → En cours</span>}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    Chambre {period.chambre || 'Non assignée'}
                                    {period.exitDate && period.motif && period.motif !== 'none' && (
                                      <span>  Motif: {period.motif.replace(/_/g, ' ')}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 sm:mt-0 text-right">
                                <div className="text-lg font-bold text-blue-600">{period.days} jours</div>
                                <div className="text-xs text-gray-500">
                                  {period.isActive ? 'Période active' : 'Terminée'}
                                </div>
                              </div>
                            </div>
                          ))}
                          {periods.length === 0 && (
                            <div className="text-center py-4 text-gray-500">
                              <Clock className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                              <p>Aucune période d'emploi trouvée</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Detailed Transaction History Table */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Historique détaillé des transactions</CardTitle>
                        <div className="text-sm text-gray-600">
                          Chaque ligne représente une transaction d'entrée ou de sortie
                        </div>
                      </CardHeader>
                      <CardContent>
                        {transactions.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[600px]">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm">N°</th>
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm">Type</th>
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm">Date</th>
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm hidden sm:table-cell">Chambre</th>
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm hidden md:table-cell">Secteur</th>
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm hidden lg:table-cell">Ferme</th>
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm">Jours</th>
                                  <th className="text-left p-2 sm:p-3 font-medium text-gray-600 text-xs sm:text-sm hidden sm:table-cell">Motif</th>
                                </tr>
                              </thead>
                              <tbody>
                                {transactions.map((transaction, index) => (
                                  <tr key={index} className={`border-b hover:bg-gray-50 ${transaction.type === 'entry' ? 'bg-green-25' : 'bg-red-25'}`}>
                                    <td className="p-2 sm:p-3 text-xs sm:text-sm">{index + 1}</td>
                                    <td className="p-2 sm:p-3">
                                      <Badge variant={transaction.type === 'entry' ? 'default' : 'destructive'} className="text-xs">
                                        {transaction.type === 'entry' ? 'Entrée' : '🚪 Sortie'}
                                      </Badge>
                                    </td>
                                    <td className="p-2 sm:p-3 text-xs sm:text-sm font-medium">
                                      {new Date(transaction.date).toLocaleDateString('fr-FR')}
                                    </td>
                                    <td className="p-2 sm:p-3 text-xs sm:text-sm hidden sm:table-cell">{transaction.chambre || '-'}</td>
                                    <td className="p-2 sm:p-3 text-xs sm:text-sm hidden md:table-cell">{transaction.secteur || '-'}</td>
                                    <td className="p-2 sm:p-3 text-xs sm:text-sm hidden lg:table-cell">
                                      {getFermeName ? getFermeName(transaction.fermeId) : transaction.fermeId}
                                    </td>
                                    <td className="p-2 sm:p-3 text-xs sm:text-sm font-medium text-blue-600">
                                      {(() => {
                                        if (transaction.type === 'entry') {
                                          // For entry, find the corresponding exit
                                          const nextExit = transactions.find((t, i) =>
                                            i > index && t.type === 'exit' && t.periodIndex === transaction.periodIndex
                                          );

                                          if (nextExit) {
                                            const entryDate = new Date(transaction.date);
                                            const exitDate = new Date(nextExit.date);
                                            const daysWorked = Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
                                            return `Durée: ${daysWorked} jours`;
                                          } else {
                                            // Still active
                                            const entryDate = new Date(transaction.date);
                                            const currentDate = new Date();
                                            const daysWorked = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
                                            return `${daysWorked} jours (en cours)`;
                                          }
                                        } else if (transaction.type === 'exit') {
                                          // For exit, find the corresponding entry
                                          const correspondingEntry = transactions.find((t, i) =>
                                            i < index && t.type === 'entry' && t.periodIndex === transaction.periodIndex
                                          );

                                          if (correspondingEntry) {
                                            const entryDate = new Date(correspondingEntry.date);
                                            const exitDate = new Date(transaction.date);
                                            const daysWorked = Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
                                            return `Total: ${daysWorked} jours`;
                                          }
                                        }
                                        return '-';
                                      })()}
                                    </td>
                                    <td className="p-2 sm:p-3 text-xs sm:text-sm hidden sm:table-cell">
                                      {transaction.type === 'exit' && transaction.motif && transaction.motif !== 'none' ? (
                                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                          {transaction.motif.replace(/_/g, ' ')}
                                        </span>
                                      ) : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <Clock className="mx-auto h-12 w-12 mb-4 text-gray-300" />
                            <p>Aucune transaction trouvée</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Work Periods Summary */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Résumée des périodes de travail</CardTitle>
                        <div className="text-sm text-gray-600">
                          Chaque période avec le nombre de jours travaillés
                        </div>
                      </CardHeader>
                      <CardContent>
                        {periods.length > 0 ? (
                          <div className="space-y-4">
                            {periods.map((period, index) => {
                              return (
                                <div key={index} className={`border rounded-lg p-4 ${period.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                                  <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2">
                                      <Badge variant={period.isActive ? "default" : "secondary"}>
                                        Période {period.periodNumber}
                                      </Badge>
                                      {period.isActive && <Badge variant="outline" className="text-green-600">En cours</Badge>}
                                    </div>
                                    <div className="text-lg font-bold text-blue-600">
                                      {period.days} jours
                                    </div>
                                  </div>

                                  {/* Entry and Exit Operations */}
                                  <div className="space-y-3 mb-4">
                                    {/* Entry Operation */}
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-green-100 rounded-lg border border-green-200 gap-2 sm:gap-0">
                                      <div className="flex items-center gap-3">
                                        <Badge variant="default" className="bg-green-600">
                                          📅 Entrée
                                        </Badge>
                                        <div>
                                          <p className="font-medium">{new Date(period.entryDate).toLocaleDateString('fr-FR')}</p>
                                          <p className="text-sm text-gray-600">Chambre {period.chambre || 'Non assignée'}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm text-gray-600">Début de période</p>
                                      </div>
                                    </div>

                                    {/* Exit Operation */}
                                    {period.exitDate ? (
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-red-100 rounded-lg border border-red-200 gap-2 sm:gap-0">
                                        <div className="flex items-center gap-3">
                                          <Badge variant="destructive">
                                            🚪 Sortie
                                          </Badge>
                                          <div>
                                            <p className="font-medium">{new Date(period.exitDate).toLocaleDateString('fr-FR')}</p>
                                            <p className="text-sm text-gray-600">
                                              {period.motif && period.motif !== 'none' ?
                                                period.motif.replace(/_/g, ' ') : 'Aucun motif'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm text-gray-600">Fin de période</p>
                                          <p className="font-bold text-red-600">{period.days} jours travaillés</p>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-blue-100 rounded-lg border border-blue-200 gap-2 sm:gap-0">
                                        <div className="flex items-center gap-3">
                                          <Badge variant="outline" className="text-blue-600">
                                            ⏳ En cours
                                          </Badge>
                                          <div>
                                            <p className="font-medium">Toujours actif</p>
                                            <p className="text-sm text-gray-600">Pas encore de sortie</p>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm text-gray-600">Jours travaillés à ce jour</p>
                                          <p className="font-bold text-blue-600">{period.days} jours</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm border-t pt-3">
                                    <div>
                                      <p className="font-medium text-gray-600">Chambre</p>
                                      <p>{period.chambre || 'Non assignée'}</p>
                                    </div>
                                    <div>
                                      <p className="font-medium text-gray-600">Secteur</p>
                                      <p>{period.secteur || 'Non défini'}</p>
                                    </div>
                                    <div>
                                      <p className="font-medium text-gray-600">Ferme</p>
                                      <p>{getFermeName ? getFermeName(period.fermeId) : period.fermeId}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Total Summary */}
                            <div className="border-t pt-4 mt-4">
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="font-semibold text-blue-800">TOTAL GÉNÉRAL</p>
                                    <p className="text-sm text-blue-600">{periods.length} période(s) de travail</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-3xl font-bold text-blue-800">{totalDays}</p>
                                    <p className="text-sm text-blue-600">jours travaillés</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <Calendar className="mx-auto h-12 w-12 mb-4 text-gray-300" />
                            <p>Aucune période de travail trouvée</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 shadow-lg border-0 ring-1 ring-slate-200 dark:ring-slate-700">
        <CardContent className="px-6 pb-6">
          <div className="space-y-6">
            {/* Search Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl px-4 pb-3 pt-4 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Rechercher par nom, CIN ou matricule..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11 h-12 text-base bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all duration-200"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Filters Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {isSuperAdmin && (
                  <div className="space-y-1">
                    <Select value={selectedFerme} onValueChange={setSelectedFerme}>
                      <SelectTrigger className="w-full h-12 text-base py-[2px] bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors duration-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400">
                        <div className="flex items-center space-x-2">
                          <Building2 className="h-4 w-4 text-slate-500" />
                          <SelectValue placeholder="les fermes" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all"> Toutes fermes </SelectItem>
                        {fermes.map(ferme => (
                          <SelectItem key={ferme.id} value={ferme.id}>
                            {ferme.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Select value={selectedGender} onValueChange={setSelectedGender}>
                    <SelectTrigger className="w-full h-12 text-base py-[2px] bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors duration-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400">
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-slate-500" />
                        <SelectValue placeholder="Sexe" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous sexe</SelectItem>
                      <SelectItem value="homme">Hommes</SelectItem>
                      <SelectItem value="femme">Femmes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-full h-12 text-base py-[2px] bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors duration-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400">
                      <div className="flex items-center space-x-2">
                        <Activity className="h-4 w-4 text-slate-500" />
                        <SelectValue placeholder="Statut" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous statut</SelectItem>
                      <SelectItem value="actif">Actifs</SelectItem>
                      <SelectItem value="inactif">Inactifs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Select value={selectedEntryMonth} onValueChange={setSelectedEntryMonth}>
                  <SelectTrigger className="w-full h-12 text-base py-[2px] bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors duration-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400">
                    <SelectValue placeholder="Mois d'entrée" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les mois</SelectItem>
                    <SelectItem value="1">Janvier</SelectItem>
                    <SelectItem value="2">Février</SelectItem>
                    <SelectItem value="3">Mars</SelectItem>
                    <SelectItem value="4">Avril</SelectItem>
                    <SelectItem value="5">Mai</SelectItem>
                    <SelectItem value="6">Juin</SelectItem>
                    <SelectItem value="7">Juillet</SelectItem>
                    <SelectItem value="8">Août</SelectItem>
                    <SelectItem value="9">Septembre</SelectItem>
                    <SelectItem value="10">Octobre</SelectItem>
                    <SelectItem value="11">Novembre</SelectItem>
                    <SelectItem value="12">Décembre</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedEntryYear} onValueChange={setSelectedEntryYear}>
                  <SelectTrigger className="w-full h-12 text-base py-[2px] bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors duration-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400">
                    <SelectValue placeholder="Année" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous Annee</SelectItem>
                    {availableEntryYears.map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                  <SelectTrigger className="w-full h-12 text-base py-[2px] bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors duration-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400">
                    <SelectValue placeholder="Superviseur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous superviseurs</SelectItem>
                    <SelectItem value="none">Sans superviseur</SelectItem>

                    {/* Active Supervisors */}
                    {supervisors?.filter(s => s.statut === 'actif').length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b">
                          Superviseurs actifs
                        </div>
                        {supervisors.filter(s => s.statut === 'actif').map(supervisor => (
                          <SelectItem key={supervisor.id} value={supervisor.id}>
                            {supervisor.nom}
                            {supervisor.company && (
                              <span className="text-muted-foreground"> ({supervisor.company})</span>
                            )}
                          </SelectItem>
                        ))}
                      </>
                    )}

                    {/* Inactive Supervisors */}
                    {supervisors?.filter(s => s.statut === 'inactif').length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b">
                          Superviseurs inactifs
                        </div>
                        {supervisors.filter(s => s.statut === 'inactif').map(supervisor => (
                          <SelectItem key={supervisor.id} value={supervisor.id} className="text-muted-foreground">
                            {supervisor.nom}
                            {supervisor.company && (
                              <span> ({supervisor.company})</span>
                            )} (inactif)
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger className="w-full h-12 text-base py-[2px] bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors duration-200 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400">
                    <SelectValue placeholder="interime" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      <Building className="h-4 w-4 mr-2 inline-block text-slate-500" />
                      Toutes interimes
                    </SelectItem>
                    <SelectItem value="none">
                      <Building className="h-4 w-4 mr-2 inline-block text-slate-500" />
                      Sans interime
                    </SelectItem>

                    {(() => {
                      const companies = Array.from(new Set(
                        supervisors
                          ?.filter(s => s.company && s.company.trim() !== '')
                          .map(s => s.company)
                      )).sort();

                      return companies.map(company => (
                        <SelectItem key={company} value={company}>
                          <Building className="h-4 w-4 mr-2 inline-block text-slate-500" />
                          {company}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>

              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
            <span className="text-lg sm:text-xl">Liste des ouvriers ({filteredWorkers.length})</span>
            <div className="flex items-center space-x-2 flex-wrap">
              {selectedWorkers.size > 0 && (
                <>
                  <Badge variant="secondary" className="px-2 py-1">
                    {selectedWorkers.size} sélectionné(s)
                    {isAllWorkersSelected && (
                      <span className="ml-1 text-green-600 font-semibold">(Tous)</span>
                    )}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkExport}
                    className="text-blue-600 hover:text-blue-700 border-blue-200 h-9 text-sm"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exporter
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkTransfer}
                    className="text-green-600 hover:text-green-700 border-green-200 h-9 text-sm"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Transférer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={loading}
                    className="text-red-600 hover:text-red-700 border-red-200 h-9 text-sm"
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-2"></div>
                    ) : (
                      <Trash2 className="mr-2 h-3 w-3" />
                    )}
                    Supprimer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    className="text-gray-600 hover:text-gray-700"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </>
              )}
              {!isAllWorkersSelected && filteredWorkers.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllWorkersGlobally}
                  className="text-purple-600 hover:text-purple-700 border-purple-200 h-9 text-sm"
                >
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Tout sélectionner
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAdvancedFiltersOpen(true)}
                className="h-9 text-sm w-full sm:w-auto"
              >
                <Filter className="mr-2 h-4 w-4" />
                Filtres avancés
              </Button>
              <Button
                variant={showAllRows ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowAllRows(!showAllRows);
                  if (!showAllRows) {
                    setCurrentPage(1); // Reset to first page when switching back to pagination
                  }
                }}
                className={`h-9 text-sm w-full sm:w-auto ${showAllRows ? 'bg-blue-600 text-white' : ''}`}
                title={showAllRows ? 'Afficher avec pagination' : 'Afficher toutes les lignes'}
              >
                {showAllRows ? (
                  <>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Paginer
                  </>
                ) : (
                  <>
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Tout afficher
                  </>
                )}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workersLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Chargement des ouvriers...</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block lg:hidden space-y-4">
                {paginatedWorkers.map((worker) => (
                  <Card key={worker.id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={selectedWorkers.has(worker.id)}
                          onCheckedChange={(checked) => handleSelectWorker(worker.id, !!checked)}
                          aria-label={`Sélectionner ${worker.nom}`}
                          className="mt-1"
                        />
                        <div>
                          <h3 className="font-semibold text-lg text-gray-900">{worker.nom}</h3>
                          <p className="text-sm text-gray-600">CIN: {worker.cin}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(worker)}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(worker)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center text-gray-600">
                        <Phone className="mr-2 h-4 w-4 text-gray-400" />
                        <span>{worker.telephone}</span>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <UserIcon className="mr-2 h-4 w-4 text-gray-400" />
                        {getGenderBadge(worker.sexe)} • {worker.age} ans
                      </div>

                      <div className="flex items-center text-gray-600">
                        <BedDouble className="mr-2 h-4 w-4 text-gray-400" />
                        <span>Chambre {worker.chambre}</span>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <MapPin className="mr-2 h-4 w-4 text-gray-400" />
                        <span>{worker.secteur}</span>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <UserIcon className="mr-2 h-4 w-4 text-gray-400" />
                        <span>Superviseur: {getSupervisorName(worker.supervisorId)}</span>
                      </div>

                      {isSuperAdmin && (
                        <div className="flex items-center text-gray-600">
                          <Building className="mr-2 h-4 w-4 text-gray-400" />
                          <span>{getFermeName(worker.fermeId)}</span>
                        </div>
                      )}

                      <div className="flex items-center text-gray-600">
                        <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                        <span>Entrée: {new Date(worker.dateEntree).toLocaleDateString('fr-FR')}</span>
                      </div>

                      {worker.dateSortie && (
                        <div className="flex items-center text-gray-600 sm:col-span-2">
                          <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                          <span>Sortie: {new Date(worker.dateSortie).toLocaleDateString('fr-FR')}</span>
                          {worker.motif && worker.motif !== 'none' && (
                            <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                              {worker.motif.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Period Duration Calculation */}
                      {worker.dateEntree && (
                        <div className="flex items-center text-gray-600">
                          <Clock className="mr-2 h-4 w-4 text-gray-400" />
                          <span>
                            Période: {(() => {
                              const entryDate = new Date(worker.dateEntree);
                              const exitDate = worker.dateSortie ? new Date(worker.dateSortie) : new Date();
                              const days = Math.max(0, Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));

                              if (worker.dateSortie) {
                                return `${days} jours travaillés`;
                              } else {
                                return `${days} jours (en cours)`;
                              }
                            })()}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewHistoryWorker(worker)}
                        className="h-9 text-blue-600 hover:text-blue-700 hover:bg-blue-50 hidden sm:flex"
                        title="Voir l'historique des transactions"
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Historique
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(worker)}
                        className="h-9"
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Modifier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(worker.id)}
                        className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Supprimer
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectAll}
                            onCheckedChange={handleSelectAll}
                            aria-label="Sélectionner tous les ouvriers"
                          />
                        </TableHead>
                        <TableHead className="whitespace-nowrap">Matricule</TableHead>
                        <TableHead className="whitespace-nowrap">Nom</TableHead>
                        <TableHead className="whitespace-nowrap">CIN</TableHead>
                        {isSuperAdmin && <TableHead className="whitespace-nowrap">Ferme</TableHead>}
                        <TableHead className="whitespace-nowrap">Contact</TableHead>
                        <TableHead className="whitespace-nowrap">Sexe</TableHead>
                        <TableHead className="whitespace-nowrap">Âge</TableHead>
                        <TableHead className="whitespace-nowrap">Secteur</TableHead>
                        <TableHead className="whitespace-nowrap">Superviseur</TableHead>
                        <TableHead className="whitespace-nowrap">Date d'entrée</TableHead>
                        <TableHead className="whitespace-nowrap">Date de sortie</TableHead>
                        <TableHead className="whitespace-nowrap">Statut</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedWorkers.map((worker) => (
                        <TableRow key={worker.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedWorkers.has(worker.id)}
                              onCheckedChange={(checked) => handleSelectWorker(worker.id, !!checked)}
                              aria-label={`Sélectionner ${worker.nom}`}
                            />
                          </TableCell>
                          <TableCell>{worker.matricule || '-'}</TableCell>
                          <TableCell className="font-medium">{worker.nom}</TableCell>
                          <TableCell>{worker.cin}</TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              <span className="text-sm text-gray-600">
                                {getFermeName(worker.fermeId)}
                              </span>
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center text-sm text-gray-600">
                              <Phone className="mr-1 h-3 w-3" />
                              {worker.telephone}
                            </div>
                          </TableCell>
                          <TableCell>{getGenderBadge(worker.sexe)}</TableCell>
                          <TableCell>{worker.age} ans</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">Chambre {worker.chambre}</div>
                              <div className="text-gray-500 flex items-center">
                                <MapPin className="mr-1 h-3 w-3" />
                                {worker.secteur}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center text-sm text-gray-600">
                              <UserIcon className="mr-1 h-3 w-3" />
                              {getSupervisorName(worker.supervisorId)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center text-sm text-gray-600">
                              <Calendar className="mr-1 h-3 w-3" />
                              {new Date(worker.dateEntree).toLocaleDateString('fr-FR')}
                            </div>
                          </TableCell>
                          <TableCell>
                            {worker.dateSortie ? (
                              <div className="text-sm">
                                <div className="flex items-center text-gray-600">
                                  <Calendar className="mr-1 h-3 w-3" />
                                  {new Date(worker.dateSortie).toLocaleDateString('fr-FR')}
                                </div>
                                {worker.motif && worker.motif !== 'none' && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {worker.motif.replace('_', ' ').charAt(0).toUpperCase() + worker.motif.replace('_', ' ').slice(1)}
                                  </div>
                                )}
                                {/* Period Duration */}
                                <div className="flex items-center text-xs text-blue-600 mt-1">
                                  <Clock className="mr-1 h-3 w-3" />
                                  {(() => {
                                    const entryDate = new Date(worker.dateEntree);
                                    const exitDate = new Date(worker.dateSortie);
                                    const days = Math.max(0, Math.floor((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
                                    return `${days} jours travaillés`;
                                  })()}
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm">
                                <span className="text-gray-400">-</span>
                                {/* Show ongoing period for active workers */}
                                {worker.dateEntree && (
                                  <div className="flex items-center text-xs text-green-600 mt-1">
                                    <Clock className="mr-1 h-3 w-3" />
                                    {(() => {
                                      const entryDate = new Date(worker.dateEntree);
                                      const currentDate = new Date();
                                      const days = Math.max(0, Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
                                      return `${days} jours (en cours)`;
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(worker)}</TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button variant="outline" size="sm" onClick={() => handleEdit(worker)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700 hidden sm:flex"
                                onClick={() => setViewHistoryWorker(worker)}
                                title="Voir l'historique des transactions"
                              >
                                <Clock className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDelete(worker.id)}
                                disabled={loading}
                              >
                                {loading ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && !showAllRows && (
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <div className="text-sm text-gray-600">
                Affichage de {startIndex + 1} à {Math.min(endIndex, totalItems)} sur {totalItems} ouvriers
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>

                <div className="flex items-center space-x-1">
                  {/* Page numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(pageNumber => {
                      // Show first page, current page, pages around current, and last page
                      if (pageNumber === 1 || pageNumber === totalPages) return true;
                      if (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1) return true;
                      return false;
                    })
                    .map((pageNumber, index, arr) => {
                      // Add ellipsis if there's a gap
                      const shouldShowEllipsisBefore = index > 0 && pageNumber - arr[index - 1] > 1;

                      return (
                        <Fragment key={pageNumber}>
                          {shouldShowEllipsisBefore && (
                            <span className="px-3 py-1 text-gray-500">...</span>
                          )}
                          <Button
                            variant={currentPage === pageNumber ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNumber)}
                            className={`w-10 h-8 ${currentPage === pageNumber ? 'bg-blue-600 text-white' : ''}`}
                          >
                            {pageNumber}
                          </Button>
                        </Fragment>
                      );
                    })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Show all rows message */}
          {showAllRows && totalItems > itemsPerPage && (
            <div className="flex items-center justify-center px-4 py-3 border-t bg-blue-50 border-blue-200">
              <div className="text-sm text-blue-700 flex items-center">
                <TrendingUp className="mr-2 h-4 w-4" />
                Affichage de tous les {totalItems} ouvriers (pagination désactivée)
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Filters Dialog */}
      <Dialog open={isAdvancedFiltersOpen} onOpenChange={setIsAdvancedFiltersOpen}>
        <DialogContent className="w-[95vw] max-w-md mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Filtres avancés</DialogTitle>
            <DialogDescription>
              Affinez votre recherche avec des critères spécifiques
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select
                value={advancedFilters.status}
                onValueChange={(value) => setAdvancedFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="actif">Actif</SelectItem>
                  <SelectItem value="inactif">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Age Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ageMin">Âge minimum</Label>
                <Input
                  id="ageMin"
                  type="number"
                  placeholder="18"
                  value={advancedFilters.ageMin}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, ageMin: e.target.value }))}
                  min="18"
                  max="65"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ageMax">Âge maximum</Label>
                <Input
                  id="ageMax"
                  type="number"
                  placeholder="65"
                  value={advancedFilters.ageMax}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, ageMax: e.target.value }))}
                  min="18"
                  max="65"
                />
              </div>
            </div>

            {/* Entry Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateEntreeFrom">Date d'entrée de</Label>
                <Input
                  id="dateEntreeFrom"
                  type="date"
                  value={advancedFilters.dateEntreeFrom}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, dateEntreeFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateEntreeTo">Date d'entrée à</Label>
                <Input
                  id="dateEntreeTo"
                  type="date"
                  value={advancedFilters.dateEntreeTo}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, dateEntreeTo: e.target.value }))}
                />
              </div>
            </div>

            {/* Exit Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateSortieFrom">Date de sortie de</Label>
                <Input
                  id="dateSortieFrom"
                  type="date"
                  value={advancedFilters.dateSortieFrom}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, dateSortieFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateSortieTo">Date de sortie à</Label>
                <Input
                  id="dateSortieTo"
                  type="date"
                  value={advancedFilters.dateSortieTo}
                  onChange={(e) => setAdvancedFilters(prev => ({ ...prev, dateSortieTo: e.target.value }))}
                />
              </div>
            </div>

            {/* Room Filter */}
            <div className="space-y-2">
              <Label htmlFor="chambre">Numéro de chambre</Label>
              <Input
                id="chambre"
                placeholder="Ex: 1"
                value={advancedFilters.chambre}
                onChange={(e) => setAdvancedFilters(prev => ({ ...prev, chambre: e.target.value }))}
              />
            </div>

            {/* Exit Reason */}
            <div className="space-y-2">
              <Label>Motif de sortie</Label>
              <Popover open={isMotifOpen} onOpenChange={setIsMotifOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isMotifOpen}
                    className="w-full justify-between"
                  >
                    {advancedFilters.motif !== 'all'
                      ? motifOptions.find((motif) => motif.value === advancedFilters.motif)?.label
                      : "Tous les motifs"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Rechercher un motif..." />
                    <CommandList>
                      <CommandEmpty>Aucun motif trouvé.</CommandEmpty>
                      <CommandGroup>
                        {motifOptions.map((motif) => (
                          <CommandItem
                            key={motif.value}
                            value={motif.value}
                            onSelect={(currentValue) => {
                              setAdvancedFilters(prev => ({
                                ...prev,
                                motif: currentValue === advancedFilters.motif ? 'all' : currentValue
                              }));
                              setIsMotifOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${advancedFilters.motif === motif.value ? "opacity-100" : "opacity-0"
                                }`}
                            />
                            {motif.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setAdvancedFilters({
                  status: 'all',
                  ageMin: '',
                  ageMax: '',
                  dateEntreeFrom: '',
                  dateEntreeTo: '',
                  dateSortieFrom: '',
                  dateSortieTo: '',
                  chambre: '',
                  motif: 'all'
                });
              }}
            >
              Réinitialiser
            </Button>
            <Button onClick={() => setIsAdvancedFiltersOpen(false)}>
              Appliquer les filtres
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Worker Import Dialog */}
      <WorkerImport
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImport={handleBulkImport}
        fermes={fermes}
        rooms={rooms}
        userFermeId={user?.fermeId}
        isSuperAdmin={isSuperAdmin}
        stockItems={stocks || []}
        existingWorkers={allWorkers}
      />

      {/* Worker Conflict Modal */}
      <WorkerConflictModal
        isOpen={crossFarmDuplicateModal.isOpen}
        onClose={() => setCrossFarmDuplicateModal({ isOpen: false, existingWorker: null, currentFarm: null, formData: null, notificationSent: false })}
        existingWorker={crossFarmDuplicateModal.existingWorker}
        currentFarm={crossFarmDuplicateModal.currentFarm}
        formData={crossFarmDuplicateModal.formData}
        notificationSent={crossFarmDuplicateModal.notificationSent}
      />



      {/* Reactivation Confirmation Modal */}
      <Dialog
        open={reactivationModal.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReactivationModal({ isOpen: false, existingWorker: null, formData: null });
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <UserPlus className="mr-2 h-5 w-5 text-blue-600" />
              Réactivation d'ouvrier
            </DialogTitle>
            <DialogDescription>
              Un ouvrier avec ce CIN existe déja dans le systéme
            </DialogDescription>
          </DialogHeader>

          {reactivationModal.existingWorker && (
            <div className="space-y-4">
              <Alert className="border-blue-200 bg-blue-50">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <div className="space-y-2">
                    <p>
                      <strong>Ouvrier trouvé:</strong> {reactivationModal.existingWorker.nom}
                    </p>
                    <p>
                      <strong>CIN:</strong> {reactivationModal.existingWorker.cin}
                    </p>
                    <p>
                      <strong>Statut actuel:</strong> {reactivationModal.existingWorker.statut === 'inactif' ? 'Inactif' : 'Actif'}
                    </p>
                    {reactivationModal.existingWorker.dateSortie && (
                      <p>
                        <strong>Date de sortie:</strong> {new Date(reactivationModal.existingWorker.dateSortie).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-3">Nouvelle entrée</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="reactivationDate" className="text-green-800 font-medium">Date d'entrée</Label>
                    <Input
                      id="reactivationDate"
                      type="date"
                      value={reactivationModal.formData?.dateEntree || ''}
                      onChange={(e) => {
                        if (reactivationModal.formData) {
                          setReactivationModal(prev => ({
                            ...prev,
                            formData: {
                              ...prev.formData!,
                              dateEntree: e.target.value
                            }
                          }));
                        }
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div className="text-sm text-green-700 space-y-1">
                    <p><strong>Chambre:</strong> {reactivationModal.formData?.chambre || 'Non assignée'}</p>
                    <p><strong>Secteur:</strong> {reactivationModal.formData?.secteur || 'Non défini'}</p>
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-600 space-y-2">
                <p>
                  <strong>Que souhaitez-vous faire ?</strong>
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Réactiver:</strong> L'ouvrier sera marqué comme actif avec une nouvelle période de travail</li>
                  <li><strong>Annuler:</strong> Aucune modification ne sera apportée</li>
                </ul>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setReactivationModal({ isOpen: false, existingWorker: null, formData: null })}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleReactivationConfirm}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Réactivation...
                </div>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Réactiver l'ouvrier
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Security Code Verification Dialog */}
      <Dialog open={showSecurityDialog} onOpenChange={setShowSecurityDialog}>
        <DialogContent className="w-[95vw] max-w-md mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-red-600" />
              Code de sécurité requis
            </DialogTitle>
            <DialogDescription>
              Pour autoriser la suppression en masse, veuillez entrer le code de sécurité fourni par le superadministrateur.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <div className="space-y-2">
                  <p><strong>Vous êtes sur le point de supprimer {selectedWorkers.size} ouvrier(s)</strong></p>
                  <p className="text-sm">Cette action nécessite une autorisation spéciale du superadministrateur.</p>
                </div>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="securityCode">Code de sécurité</Label>
              <Input
                id="securityCode"
                type="text"
                placeholder="Entrez le code à 6 chiffres"
                value={securityCode}
                onChange={(e) => {
                  setSecurityCode(e.target.value);
                  setSecurityError('');
                }}
                maxLength={6}
                className={securityError ? "border-red-500" : ""}
              />
              {securityError && (
                <p className="text-sm text-red-600">{securityError}</p>
              )}
            </div>

            <div className="text-sm text-gray-600">
              <p><strong>Instructions:</strong></p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Contactez votre superadministrateur pour obtenir un code valide</li>
                <li>Le code est valide pendant 24 heures</li>
                <li>Chaque code a une limite de suppressions définie par l'administrateur</li>
                <li>Le code peut être réutilisé jusqu'à atteindre sa limite</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowSecurityDialog(false);
                setSecurityCode('');
                setSecurityError('');
              }}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button
              onClick={verifySecurityCode}
              disabled={loading || !securityCode.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Vérification...
                </div>
              ) : (
                <>
                  <AlertCircle className="mr-2 h-4 w-4" />
                  Vérifier et supprimer
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
