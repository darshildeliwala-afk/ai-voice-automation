import type { PaginationDto, SortOrder } from "./pagination.dto";

export interface PaginationParams {
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export function resolvePage(dto: PaginationDto): number {
  return dto.page && dto.page > 0 ? dto.page : DEFAULT_PAGE;
}

export function resolveLimit(dto: PaginationDto): number {
  return dto.limit && dto.limit > 0 ? dto.limit : DEFAULT_LIMIT;
}

export function buildPaginationParams(dto: PaginationDto): PaginationParams {
  const page = resolvePage(dto);
  const limit = resolveLimit(dto);

  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildOrderBy(
  dto: PaginationDto,
): Record<string, SortOrder> | undefined {
  if (!dto.sortBy) {
    return undefined;
  }

  return { [dto.sortBy]: dto.sortOrder ?? "asc" };
}

export function buildPaginationMeta(
  total: number,
  dto: PaginationDto,
): PaginationMeta {
  const page = resolvePage(dto);
  const limit = resolveLimit(dto);

  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
