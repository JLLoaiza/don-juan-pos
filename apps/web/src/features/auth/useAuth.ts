import { useContext } from "react";
import { AuthReactContext, type AuthContextValue } from "./AuthProvider";

export function useAuth(): AuthContextValue {
  const value = useContext(AuthReactContext);
  if (!value) throw new Error("useAuth must be used within an AuthProvider.");
  return value;
}
