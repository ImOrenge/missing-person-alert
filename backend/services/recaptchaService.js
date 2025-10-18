const { RecaptchaEnterpriseServiceClient, protos } = require('@google-cloud/recaptcha-enterprise');

const client = new RecaptchaEnterpriseServiceClient();

const DEFAULT_PROJECT_ID = process.env.RECAPTCHA_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'missing-person-alram';
const DEFAULT_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_WEB_SITE_KEY;

const AnnotationEnum = protos.google.cloud.recaptchaenterprise.v1.AnnotateAssessmentRequest.Annotation;
const ReasonEnum = protos.google.cloud.recaptchaenterprise.v1.AnnotateAssessmentRequest.Reason;

const annotationNameByValue = Object.entries(AnnotationEnum).reduce((acc, [key, value]) => {
  if (typeof value === 'number') {
    acc[value] = key;
  }
  return acc;
}, {});

const reasonNameByValue = Object.entries(ReasonEnum).reduce((acc, [key, value]) => {
  if (typeof value === 'number') {
    acc[value] = key;
  }
  return acc;
}, {});

const normalizeAnnotationInput = (value) => {
  if (typeof value === 'number') {
    if (annotationNameByValue[value]) {
      return value;
    }
    throw new Error(`Unsupported annotation numeric value: ${value}`);
  }

  if (!value) {
    return AnnotationEnum.ANNOTATION_UNSPECIFIED;
  }

  const key = String(value).trim().toUpperCase();
  if (AnnotationEnum[key] !== undefined) {
    return AnnotationEnum[key];
  }

  const prefixed = `ANNOTATION_${key}`;
  if (AnnotationEnum[prefixed] !== undefined) {
    return AnnotationEnum[prefixed];
  }

  throw new Error(`Unknown annotation value: ${value}`);
};

const normalizeReasonInput = (value) => {
  if (typeof value === 'number') {
    if (reasonNameByValue[value]) {
      return value;
    }
    throw new Error(`Unsupported reason numeric value: ${value}`);
  }

  if (!value) {
    return ReasonEnum.REASON_UNSPECIFIED;
  }

  const key = String(value).trim().toUpperCase();
  if (ReasonEnum[key] !== undefined) {
    return ReasonEnum[key];
  }

  const prefixed = `REASON_${key}`;
  if (ReasonEnum[prefixed] !== undefined) {
    return ReasonEnum[prefixed];
  }

  throw new Error(`Unknown reason value: ${value}`);
};

const parseHashedAccountId = (input) => {
  if (!input) {
    return undefined;
  }

  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (typeof input !== 'string') {
    throw new Error('hashedAccountId must be a Buffer or string');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  // Attempt base64 first, fallback to hex.
  try {
    return Buffer.from(trimmed, 'base64');
  } catch (base64Error) {
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
      return Buffer.from(trimmed, 'hex');
    }
    throw new Error('hashedAccountId string must be base64 or hex encoded');
  }
};

const resolveSiteKey = (siteKey) => {
  const resolved = siteKey || DEFAULT_SITE_KEY;
  if (!resolved) {
    throw new Error('RECAPTCHA_SITE_KEY is not configured');
  }
  return resolved;
};

const resolveProjectId = (projectId) => projectId || DEFAULT_PROJECT_ID;

const mapReasonsToNames = (reasons = []) => {
  return reasons
    .map((reason) => reasonNameByValue[reason] || reason)
    .filter(Boolean);
};

const mapInvalidReason = (invalidReason) => {
  if (typeof invalidReason === 'string') {
    return invalidReason;
  }
  if (typeof invalidReason === 'number') {
    return protos.google.cloud.recaptchaenterprise.v1.TokenProperties.InvalidReason[invalidReason] || invalidReason;
  }
  return null;
};

async function assessToken({
  token,
  action = 'report_submit',
  siteKey,
  projectId,
  userIp,
  userAgent
}) {
  if (!token) {
    throw new Error('reCAPTCHA token is required');
  }

  const finalSiteKey = resolveSiteKey(siteKey);
  const finalProjectId = resolveProjectId(projectId);

  const event = {
    token,
    siteKey: finalSiteKey,
    expectedAction: action
  };

  if (userIp) {
    event.userIpAddress = userIp;
  }

  if (userAgent) {
    event.userAgent = userAgent;
  }

  const request = {
    parent: client.projectPath(finalProjectId),
    assessment: {
      event
    }
  };

  const [response] = await client.createAssessment(request);

  const tokenProperties = response.tokenProperties || null;
  const riskAnalysis = response.riskAnalysis || null;

  const valid = Boolean(tokenProperties?.valid);
  const actionPerformed = tokenProperties?.action || null;
  const score = typeof riskAnalysis?.score === 'number' ? riskAnalysis.score : null;
  const riskReasons = Array.isArray(riskAnalysis?.reasons) ? mapReasonsToNames(riskAnalysis.reasons) : [];
  const invalidReason = tokenProperties?.invalidReason ? mapInvalidReason(tokenProperties.invalidReason) : null;

  return {
    name: response.name,
    valid,
    score,
    action: actionPerformed,
    reasons: riskReasons,
    tokenProperties,
    invalidReason,
    riskAnalysis,
    raw: response
  };
}

async function requestScoreReview({
  assessmentName,
  annotation,
  reasons,
  hashedAccountId
}) {
  if (!assessmentName) {
    throw new Error('assessmentName is required to request a score review');
  }

  const annotationValue = normalizeAnnotationInput(annotation);
  const reasonValues = Array.isArray(reasons) ? reasons.map(normalizeReasonInput) : [];
  const hashedIdBuffer = parseHashedAccountId(hashedAccountId);

  const request = {
    name: assessmentName,
    annotation: annotationValue
  };

  if (reasonValues.length > 0) {
    request.reasons = reasonValues;
  }

  if (hashedIdBuffer) {
    request.hashedAccountId = hashedIdBuffer;
  }

  const [response] = await client.annotateAssessment(request);

  return {
    annotation: annotationNameByValue[annotationValue] || annotationValue,
    reasons: reasonValues.map((reason) => reasonNameByValue[reason] || reason),
    raw: response
  };
}

module.exports = {
  assessToken,
  requestScoreReview,
  constants: {
    AnnotationEnum,
    ReasonEnum,
    annotationNameByValue,
    reasonNameByValue
  }
};
