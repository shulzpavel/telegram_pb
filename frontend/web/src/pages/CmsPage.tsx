import { useEffect, useState } from "react";
import { cmsAuthApi } from "../features/cms/api/cmsClient";
import type { CmsPrincipal } from "../features/cms/api/cmsTypes";
import CmsLoginPage from "../features/cms/auth/CmsLoginPage";
import { Centered } from "../features/cms/components/CmsPrimitives";
import CmsShell from "../features/cms/layout/CmsShell";

export default function CmsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [principal, setPrincipal] = useState<CmsPrincipal | null>(null);

  useEffect(() => {
    cmsAuthApi
      .me()
      .then(setPrincipal)
      .catch(() => setPrincipal(null))
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) {
    return <Centered text="Loading" />;
  }

  if (!principal) {
    return <CmsLoginPage onLogin={setPrincipal} />;
  }

  return <CmsShell principal={principal} onLogout={() => setPrincipal(null)} />;
}
