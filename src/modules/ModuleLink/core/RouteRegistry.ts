import type { ModuleLinkRoute } from './types.js';

export class ModuleLinkRouteRegistry {
  private readonly routes: ModuleLinkRoute[] = [];

  register(route: ModuleLinkRoute): void {
    this.routes.push(route);
  }

  resolve(targetModule: string, action: string): ModuleLinkRoute | undefined {
    return this.routes.find((route) => route.targetModule === targetModule && route.action === action)
      ?? this.routes.find((route) => route.targetModule === targetModule && route.action === undefined);
  }

  list(): readonly ModuleLinkRoute[] {
    return [...this.routes];
  }
}
