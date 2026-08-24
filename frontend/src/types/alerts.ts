export interface AlertSubscriptionSettings {
  caseIds: string[];
  regionCodes: string[];
  radius: { regionCode: string; distanceKm: 10 } | null;
  pushEnabled: boolean;
  quietHours: { enabled: boolean; start: string; end: string; allowEmergency: boolean };
  deliveryReady: boolean;
}
