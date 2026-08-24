import { useEffect, useState } from 'react';
import { fetchPublicBanners } from '../services/bannerServiceV2';
import type { BannerDto } from '../types/banner';

export const useSiteBanners = (enabled: boolean) => {
  const [banners, setBanners] = useState<BannerDto[]>([]);
  useEffect(() => {
    if (!enabled) { setBanners([]); return undefined; }
    const controller = new AbortController();
    const load = () => fetchPublicBanners(controller.signal).then(setBanners).catch(() => undefined);
    load();
    const interval = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [enabled]);
  return banners;
};
