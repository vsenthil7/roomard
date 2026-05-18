/**
 * Re-export TypeScript types from @roomard/schemas so consumers can import
 * types without pulling Zod into their bundle.
 */
export type {
  Uuid,
  IsoDateTime,
  IsoDate,
  CurrencyCode,
  CountryCode,
  Email,
  PhoneE164,
  Money,
  Confidence,
  Address,
  ActorRef,
  AuditableMeta,
  EvidenceKind,
  EvidenceRef,
  PageMeta,
  ErrorResponse,
} from '@roomard/schemas';

export type {
  Guest,
  GuestCreateRequest,
  GuestPatchRequest,
  GuestSearchQuery,
  Preference,
  PreferenceKind,
  PreferencePolarity,
  SayThisSuggestion,
} from '@roomard/schemas';

export type {
  CardCaptureRequest,
  CaptureResponse,
  CaptureMetadata,
  OcrField,
  OcrResult,
  VoiceMemoCaptureRequest,
} from '@roomard/schemas';

export type {
  Brief,
  BriefItem,
  BriefGenerateRequest,
  HousekeepingPrep,
} from '@roomard/schemas';

export type {
  ExceptionQueueItem,
  ExceptionPatchRequest,
  ExceptionKind,
  IdentityMergeCandidate,
} from '@roomard/schemas';

export type { Review, ReviewLinkRequest, ReviewSource } from '@roomard/schemas';
export type { Tenant, Property, PropertyCreateRequest, Role } from '@roomard/schemas';
export type { AuditEvent, AuditQuery, AuditExportRequest } from '@roomard/schemas';
export type {
  LoginResponse,
  TokenPair,
  PasswordLoginRequest,
  MfaVerifyRequest,
  RefreshRequest,
  LogoutRequest,
  MeResponse,
  SsoStartRequest,
} from '@roomard/schemas';
