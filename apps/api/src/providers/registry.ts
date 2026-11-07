import {
  AppError,
  type Capability,
  ERROR_CODE,
  HTTP_STATUS,
  type Provider,
} from '@freetier-loop/shared';
import type { CapabilityMap, ProviderAdapter } from './contracts';

export class ProviderRegistry {
  private readonly adapters = new Map<Provider, ProviderAdapter>();

  register(adapter: ProviderAdapter): this {
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  getAdapter(provider: Provider): ProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new AppError(
        ERROR_CODE.PROVIDER_CAPABILITY_UNSUPPORTED,
        `No provider adapter registered for "${provider}"`,
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }
    return adapter;
  }

  getCapability<K extends Capability>(provider: Provider, capability: K): CapabilityMap[K] {
    const adapter = this.getAdapter(provider);
    const impl = adapter.getCapability(capability);
    if (!impl) {
      throw new AppError(
        ERROR_CODE.PROVIDER_CAPABILITY_UNSUPPORTED,
        `Provider "${provider}" does not support capability "${capability}"`,
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }
    return impl;
  }
}
