import { createContext } from "react";

export interface ActiveBusinessProfileContextValue {
  activeBusinessProfileId: string | null;
  setActiveBusinessProfileId: (id: string | null) => void;
}

export const ActiveBusinessProfileContext = createContext<ActiveBusinessProfileContextValue | null>(null);
