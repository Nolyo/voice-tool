import { useContext } from "react";
import { CloudContext } from "@/contexts/CloudContext";

export function useCloud() {
  return useContext(CloudContext);
}
