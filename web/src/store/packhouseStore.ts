import { create } from "zustand";

interface PackhouseState {
  /** Currently selected packhouse ID, or null for "All Packhouses". */
  currentPackhouseId: string | null;
  setPackhouse: (id: string | null) => void;
}

export const usePackhouseStore = create<PackhouseState>((set) => ({
  currentPackhouseId: localStorage.getItem("current_packhouse_id") || null,
  setPackhouse: (id) => {
    if (id) {
      localStorage.setItem("current_packhouse_id", id);
    } else {
      localStorage.removeItem("current_packhouse_id");
    }
    set({ currentPackhouseId: id });
  },
}));
