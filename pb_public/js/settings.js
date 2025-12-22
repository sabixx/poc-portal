// settings.js - User settings and team management
// VERSION 1.0

import { appState } from "./state.js";
import { renderMainView, renderSeFilters, buildVisibleSEs } from "./overview.js";
import { loadManagerSeMapping } from "./filters.js";

console.log("[Settings] VERSION 1.0 - User settings and team management");

let settingsModal = null;

/**
 * Show the settings modal
 */
export async function showSettingsModal() {
  const currentUser = appState.currentUser;
  if (!currentUser) return;
  
  // Remove existing modal if any
  if (settingsModal) {
    settingsModal.remove();
  }
  
  // Get available regions from users
  const regions = new Set();
  appState.allUsers.forEach(u => {
    if (u.region && u.region.trim() !== "") {
      regions.add(u.region);
    }
  });
  const regionList = Array.from(regions).sort();
  
  // Build region options
  const regionOptions = regionList.map(r => 
    `<option value="${r}" ${currentUser.region === r ? 'selected' : ''}>${r}</option>`
  ).join('');
  
  // Get team members for managers and AEs
  let teamManagementHtml = '';
  if (currentUser.role === 'manager' || currentUser.role === 'ae') {
    const teamMembers = await getManagerTeamMembers(currentUser.id);
    const availableSEs = appState.allUsers.filter(u => u.role === 'se');
    
    teamManagementHtml = `
      <div class="settings-section">
        <h3>Team Management</h3>
        <p class="settings-hint">Assign SEs to your team. These will be shown when you select "My Team" view.</p>
        
        <div class="team-members-container">
          <div class="team-members-list" id="team-members-list">
            ${teamMembers.length === 0 ? 
              '<div class="team-empty">No team members assigned yet</div>' :
              teamMembers.map(m => `
                <div class="team-member-item" data-mapping-id="${m.mappingId}">
                  <span class="team-member-name">${m.name}</span>
                  <span class="team-member-region">${m.region || 'No region'}</span>
                  <button type="button" class="team-member-remove" data-se-id="${m.id}" title="Remove from team">×</button>
                </div>
              `).join('')
            }
          </div>
          
          <div class="team-add-section">
            <select id="add-team-member-select" class="settings-select">
              <option value="">-- Select SE to add --</option>
              ${availableSEs
                .filter(se => !teamMembers.find(tm => tm.id === se.id))
                .map(se => `<option value="${se.id}">${se.name || se.displayName || se.email || 'Unknown SE'} ${se.region ? `(${se.region})` : ''}</option>`)
                .join('')
              }
            </select>
            <button type="button" id="add-team-member-btn" class="settings-btn settings-btn-primary">Add to Team</button>
          </div>
        </div>
      </div>
    `;
  }
  
  // Create modal
  settingsModal = document.createElement('div');
  settingsModal.className = 'settings-modal-overlay';
  settingsModal.innerHTML = `
    <div class="settings-modal">
      <div class="settings-modal-header">
        <h2>Settings</h2>
        <button type="button" class="settings-modal-close" id="settings-close">×</button>
      </div>
      
      <div class="settings-modal-body">
        <div class="settings-section">
          <h3>Your Profile</h3>
          <div class="settings-field">
            <label>Email</label>
            <input type="text" value="${currentUser.email}" disabled class="settings-input settings-input-disabled">
          </div>
          <div class="settings-field">
            <label>Role</label>
            <input type="text" value="${currentUser.role}" disabled class="settings-input settings-input-disabled">
          </div>
          <div class="settings-field">
            <label>Region</label>
            <select id="user-region-select" class="settings-select">
              <option value="">-- Select region --</option>
              ${regionOptions}
            </select>
          </div>
          <button type="button" id="save-profile-btn" class="settings-btn settings-btn-primary">Save Profile</button>
        </div>
        
        ${teamManagementHtml}
      </div>
    </div>
  `;
  
  document.body.appendChild(settingsModal);
  
  // Attach event listeners
  attachSettingsListeners();
}

/**
 * Get team members for a manager
 */
async function getManagerTeamMembers(managerId) {
  try {
    const mappings = await appState.pb.collection("manager_se_map").getFullList({
      filter: `manager = "${managerId}"`
    });

    // Look up SE details from appState.allUsers instead of relying on expand
    // m.se can be an array of SE IDs, so we need to flatten the results
    const teamMembers = [];

    for (const m of mappings) {
      // Handle both array and single value for m.se
      const seIds = Array.isArray(m.se) ? m.se : [m.se];

      for (const seId of seIds) {
        const seUser = appState.allUsers.find(u => u.id === seId);
        if (seUser || seId) {
          teamMembers.push({
            id: seId,
            mappingId: m.id,
            name: seUser?.name || seUser?.displayName || seUser?.email || 'Unknown SE',
            email: seUser?.email || '',
            region: seUser?.region || ''
          });
        }
      }
    }

    return teamMembers;
  } catch (err) {
    console.error("[Settings] Failed to load team members:", err);
    return [];
  }
}

/**
 * Attach event listeners for settings modal
 */
function attachSettingsListeners() {
  // Close button
  document.getElementById('settings-close')?.addEventListener('click', closeSettingsModal);
  
  // Click outside to close
  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
  
  // Save profile button
  document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile);
  
  // Add team member button (managers only)
  document.getElementById('add-team-member-btn')?.addEventListener('click', addTeamMember);
  
  // Remove team member buttons
  document.querySelectorAll('.team-member-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mappingId = e.target.closest('.team-member-item')?.dataset.mappingId;
      if (mappingId) {
        removeTeamMember(mappingId);
      }
    });
  });
  
  // Escape key to close
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    closeSettingsModal();
  }
}

/**
 * Close the settings modal
 */
function closeSettingsModal() {
  if (settingsModal) {
    settingsModal.remove();
    settingsModal = null;
  }
  document.removeEventListener('keydown', handleEscapeKey);
}

/**
 * Save user profile (region)
 */
async function saveProfile() {
  const regionSelect = document.getElementById('user-region-select');
  const newRegion = regionSelect?.value || '';
  
  try {
    await appState.pb.collection('users').update(appState.currentUser.id, {
      region: newRegion
    });
    
    // Update local state
    appState.currentUser.region = newRegion;
    
    // Update the user in allUsers too
    const userIndex = appState.allUsers.findIndex(u => u.id === appState.currentUser.id);
    if (userIndex >= 0) {
      appState.allUsers[userIndex].region = newRegion;
    }
    
    showToast('Profile saved successfully!', 'success');
  } catch (err) {
    console.error("[Settings] Failed to save profile:", err);
    showToast('Failed to save profile', 'error');
  }
}

/**
 * Add a team member (manager only)
 */
async function addTeamMember() {
  const select = document.getElementById('add-team-member-select');
  const seId = select?.value;
  
  if (!seId) {
    showToast('Please select an SE to add', 'error');
    return;
  }
  
  try {
    await appState.pb.collection('manager_se_map').create({
      manager: appState.currentUser.id,
      se: seId
    });
    
    // Reload the manager's SE mapping
    await loadManagerSeMapping(appState.pb, appState.currentUser);
    
    // Refresh the modal to show updated team
    showSettingsModal();
    
    // Refresh filters
    const visibleSEs = buildVisibleSEs();
    await renderSeFilters(visibleSEs);
    
    showToast('Team member added successfully!', 'success');
  } catch (err) {
    console.error("[Settings] Failed to add team member:", err);
    showToast('Failed to add team member', 'error');
  }
}

/**
 * Remove a team member (manager only)
 */
async function removeTeamMember(mappingId) {
  if (!confirm('Remove this SE from your team?')) return;
  
  try {
    await appState.pb.collection('manager_se_map').delete(mappingId);
    
    // Reload the manager's SE mapping
    await loadManagerSeMapping(appState.pb, appState.currentUser);
    
    // Refresh the modal
    showSettingsModal();
    
    // Refresh filters
    const visibleSEs = buildVisibleSEs();
    await renderSeFilters(visibleSEs);
    
    showToast('Team member removed', 'success');
  } catch (err) {
    console.error("[Settings] Failed to remove team member:", err);
    showToast('Failed to remove team member', 'error');
  }
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  // Remove existing toast
  document.querySelector('.settings-toast')?.remove();
  
  const toast = document.createElement('div');
  toast.className = `settings-toast settings-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}