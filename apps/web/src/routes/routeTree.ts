/**
 * Route tree.
 *
 * TanStack Router supports either filesystem-based codegen or programmatic
 * assembly. We use programmatic here to avoid the codegen step in CI and
 * to keep the dependency surface small.
 */
import { Route as RootRoute } from './__root.js';
import { Route as LoginRoute } from './login.js';
import { Route as IndexRoute } from './index.js';
import { Route as GuestListRoute } from './guests.index.js';
import { Route as GuestDetailRoute } from './guests.$id.js';
import { Route as CaptureNewRoute } from './captures.new.js';
import { Route as ExceptionsRoute } from './exceptions.js';

export const routeTree = RootRoute.addChildren([
  LoginRoute,
  IndexRoute,
  GuestListRoute,
  GuestDetailRoute,
  CaptureNewRoute,
  ExceptionsRoute,
]);
