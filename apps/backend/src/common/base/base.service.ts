import { ResourceNotFoundException } from "../exceptions/not-found.exception";
import type { PaginationDto, SortOrder } from "../pagination/pagination.dto";
import {
  buildOrderBy,
  buildPaginationParams,
  type PaginationParams,
} from "../pagination/pagination.util";

export abstract class BaseService {
  protected throwIfNotFound<T>(
    entity: T | null | undefined,
    resource: string,
    identifier?: string | number,
  ): T {
    if (entity === null || entity === undefined) {
      throw new ResourceNotFoundException(resource, identifier);
    }

    return entity;
  }

  protected applySoftDelete<W extends Record<string, unknown>>(
    where: W = {} as W,
  ): W & { deletedAt: null } {
    return { ...where, deletedAt: null };
  }

  protected buildPagination(
    dto: PaginationDto,
  ): PaginationParams & { orderBy?: Record<string, SortOrder> } {
    return {
      ...buildPaginationParams(dto),
      orderBy: buildOrderBy(dto),
    };
  }

  protected async exists(finder: () => Promise<unknown>): Promise<boolean> {
    const result = await finder();

    if (typeof result === "number") {
      return result > 0;
    }

    return result !== null && result !== undefined;
  }
}
