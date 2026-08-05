import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { Prisma, type KnowledgeBase } from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { CreateKnowledgeBaseDto } from "./dto/create-knowledge-base.dto";
import { UpdateKnowledgeBaseDto } from "./dto/update-knowledge-base.dto";

export interface PaginatedKnowledgeBases {
  data: KnowledgeBase[];
  meta: PaginationMeta;
}

export interface KnowledgeBaseSearchResult {
  /** The top match's content (trimmed excerpt if long), or "" when nothing matched. */
  answer: string;
  sourceDocuments: { id: string; title: string }[];
  /** matched-terms / query-terms of the top result, 0-1. 0 when nothing matched. */
  confidence: number;
}

const ANSWER_EXCERPT_LENGTH = 500;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** Title matches count double -- a query term appearing in the title is a stronger relevance signal than one buried in body content. */
function scoreCandidate(
  entry: Pick<KnowledgeBase, "title" | "description" | "content">,
  terms: string[],
): { score: number; matchedTerms: number } {
  const titleText = entry.title.toLowerCase();
  const bodyText = `${entry.description ?? ""} ${entry.content ?? ""}`.toLowerCase();

  let score = 0;
  let matchedTerms = 0;
  for (const term of terms) {
    const inTitle = titleText.includes(term);
    const inBody = bodyText.includes(term);
    if (inTitle) score += 2;
    if (inBody) score += 1;
    if (inTitle || inBody) matchedTerms += 1;
  }

  return { score, matchedTerms };
}

@Injectable()
export class KnowledgeBaseService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {
    super();
  }

  async createKnowledgeBase(
    dto: CreateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    await this.workspaceService.getWorkspaceById(dto.workspaceId);

    return this.prisma.knowledgeBase.create({ data: dto });
  }

  async getKnowledgeBaseById(id: string): Promise<KnowledgeBase> {
    const knowledgeBase = this.throwIfNotFound(
      await this.prisma.knowledgeBase.findFirst({
        where: this.applySoftDelete({ id }),
      }),
      "Knowledge Base",
      id,
    );

    await this.workspaceService.getWorkspaceById(knowledgeBase.workspaceId);

    return knowledgeBase;
  }

  async listKnowledgeBases(
    workspaceId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedKnowledgeBases> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where: Prisma.KnowledgeBaseWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(search
        ? { title: { contains: search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.knowledgeBase.findMany({ where, skip, take, orderBy }),
      this.prisma.knowledgeBase.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  /**
   * Improved retrieval for the search_knowledge_base tool (Sprint 19).
   * No embeddings/vector search infra exists in this codebase -- this
   * broadens the match from listKnowledgeBases()'s title-only `contains`
   * to title+description+content, scores each candidate by matched-term
   * overlap (title matches weighted higher), and returns a single answer
   * plus source documents plus a confidence score, instead of a raw
   * results list.
   */
  async searchWithRelevance(
    workspaceId: string,
    query: string,
    limit = 5,
  ): Promise<KnowledgeBaseSearchResult> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const terms = tokenize(query);
    if (terms.length === 0) {
      return { answer: "", sourceDocuments: [], confidence: 0 };
    }

    const candidates = await this.prisma.knowledgeBase.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: terms.flatMap((term) => [
          { title: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { content: { contains: term, mode: Prisma.QueryMode.insensitive } },
        ]),
      },
    });

    if (candidates.length === 0) {
      return { answer: "", sourceDocuments: [], confidence: 0 };
    }

    const scored = candidates
      .map((entry) => ({ entry, ...scoreCandidate(entry, terms) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const top = scored[0];
    const topContent = top.entry.content ?? top.entry.description ?? "";
    const answer =
      topContent.length > ANSWER_EXCERPT_LENGTH
        ? `${topContent.slice(0, ANSWER_EXCERPT_LENGTH)}...`
        : topContent;

    return {
      answer,
      sourceDocuments: scored.map((s) => ({ id: s.entry.id, title: s.entry.title })),
      confidence: top.matchedTerms / terms.length,
    };
  }

  async updateKnowledgeBase(
    id: string,
    dto: UpdateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    await this.getKnowledgeBaseById(id);

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: dto,
    });
  }

  async softDeleteKnowledgeBase(id: string): Promise<KnowledgeBase> {
    await this.getKnowledgeBaseById(id);

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
