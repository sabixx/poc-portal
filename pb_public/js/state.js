// Global app state shared between modules

export const appState = {
  pb: null,
  currentUser: null,
  allUsers: [],
  allPocs: [],
  allPuc: [],
  allComments: [],
  allFeatureRequests: [],
  // Pre-indexed caches for performance
  commentsByPoc: new Map(),
  commentsByPuc: new Map(),
  featureRequestsByPoc: new Map(),
  selectedSeIds: new Set(),
  showOldPocs: false,
};

const STORAGE_KEY_SE = "poc_portal_selected_se_ids";

export function loadSelectedSe() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SE);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      appState.selectedSeIds = new Set(arr);
    }
  } catch (e) {
    console.warn("[POC-PORTAL] Cannot load SE filter from localStorage:", e);
  }
}

export function saveSelectedSe() {
  try {
    localStorage.setItem(
      STORAGE_KEY_SE,
      JSON.stringify(Array.from(appState.selectedSeIds))
    );
  } catch (e) {
    console.warn("[POC-PORTAL] Cannot save SE filter:", e);
  }
}
