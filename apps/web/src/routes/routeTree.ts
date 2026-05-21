/**
 * Route tree.
 *
 * TanStack Router supports either filesystem-based codegen or programmatic
 * assembly. We use programmatic here to avoid the codegen step in CI and
 * to keep the dependency surface small.
 */
import { Route as RootRoute } from './__root.js';
import { Route as CaptureNewRoute } from './captures.new.js';
import { Route as ExceptionsRoute } from './exceptions.js';
import { Route as GuestDetailRoute } from './guests.$id.js';
import { Route as GuestListRoute } from './guests.index.js';
import { Route as LoginRoute } from './login.js';
import { Route as OnboardingRoute } from './onboarding.js';
import { Route as PrepCardsRoute } from './prep-cards.js';

import { Route as IndexRoute } from './index.js';

export const routeTree = RootRoute.addChildren([
  LoginRoute,
  IndexRoute,
  OnboardingRoute,
  GuestListRoute,
  GuestDetailRoute,
  CaptureNewRoute,
  ExceptionsRoute,
  PrepCardsRoute,
]);
