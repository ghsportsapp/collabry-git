import { useBrandAuth } from "@/contexts/BrandAuthContext";
import { useCreatorAuth } from "@/contexts/CreatorAuthContext";
import { useFcmRegistration } from "@/hooks/useFcmRegistration";

/** Registers an FCM token + listens for foreground messages while a brand is signed in. */
export function BrandFcmAutoRegister() {
  const { accessToken } = useBrandAuth();
  useFcmRegistration({
    userType: "BRAND",
    getAccessToken: () => accessToken,
  });
  return null;
}

/** Registers an FCM token + listens for foreground messages while a creator is signed in. */
export function CreatorFcmAutoRegister() {
  const { accessToken } = useCreatorAuth();
  useFcmRegistration({
    userType: "CREATOR",
    getAccessToken: () => accessToken,
  });
  return null;
}
