# Worker Deletion and Room Cleanup Functionality

## Overview

This document describes the enhanced worker deletion functionality that automatically manages room occupancy when workers are deleted from the system.

## Features

### 1. Individual Worker Deletion
When a single worker is deleted:
- The worker is removed from their assigned room's `listeOccupants` array
- The room's `occupantsActuels` count is decremented
- Room occupancy is synchronized to ensure consistency

### 2. Bulk Worker Deletion
When multiple workers are selected and deleted:
- Each worker is removed from their respective rooms
- Room occupancy counts are updated accordingly
- System performs occupancy synchronization after batch deletion

### 3. Complete Worker Deletion (NEW)
When ALL active workers in the system are deleted:
- **All rooms have their `listeOccupants` arrays cleared**
- **All rooms have their `occupantsActuels` set to 0**
- This ensures complete data consistency when the business is cleared of all workers

## User Interface Enhancements

### Selection Features
- **Page Selection**: Checkbox to select all workers on the current page
- **Global Selection**: "Tout sélectionner" button to select ALL filtered workers
- **Visual Indicator**: Badge shows "(Tous)" when all workers are selected
- **Clear Selection**: X button to clear all selections

### Bulk Operations
- **Export**: Export selected workers to Excel
- **Delete**: Delete selected workers with confirmation dialog
- **Visual Feedback**: Loading indicators and success/error messages

## Technical Implementation

### Core Functions

#### `clearAllRoomOccupants()`
```typescript
// Clears listeOccupants from all rooms when all workers are deleted
await clearAllRoomOccupants();
```

#### `isDeleteAllWorkers()`
```typescript
// Detects if all active workers are being deleted
const deletingAll = isDeleteAllWorkers(selectedWorkerIds, allWorkers);
```

### Workflow

1. **User selects workers** using checkboxes or "select all" button
2. **User clicks delete** and confirms the action
3. **System checks** if all active workers are selected
4. **If all workers selected**:
   - Delete all worker documents
   - Clear ALL room occupants using `clearAllRoomOccupants()`
5. **If partial deletion**:
   - Delete selected worker documents
   - Update individual room occupancy
   - Run occupancy synchronization

### Error Handling

- Atomic transactions ensure data consistency
- Failed deletions are reported with specific error messages
- Rollback mechanism prevents partial failures
- Network issues are handled gracefully

## Use Cases

### Complete Business Reset
When a business needs to clear all workers:
1. Go to Workers page
2. Click "Tout sélectionner" to select all workers
3. Click "Supprimer" and confirm
4. System automatically clears all room occupants

### Selective Worker Removal
When removing specific workers:
1. Use checkboxes to select individual workers
2. Use filters to narrow down selection
3. Click "Supprimer" for targeted deletion
4. Room occupancy updated automatically

### Farm Deletion
When a farm is deleted:
- All workers in that farm are deleted
- All rooms in that farm are deleted
- No additional room cleanup needed (rooms are removed)

## Data Consistency

The system ensures:
- Workers cannot exist in rooms after deletion
- Room occupancy counts match actual occupants
- No orphaned references between workers and rooms
- Atomic operations prevent data corruption

## Testing

The functionality includes comprehensive tests:
- Unit tests for helper functions
- Integration tests for deletion workflows
- Edge case handling (empty arrays, network failures)
- Performance tests for bulk operations

## Security

- Only authorized users can delete workers
- Confirmation dialogs prevent accidental deletions
- Audit trail maintains deletion history
- Role-based access controls apply
