import { db } from './db';
import { eq, and, not, desc, asc, or, ilike, count, notInArray, inArray, SQL } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import {
  users,
  media,
  galleries,
  galleryMedia,
} from '@/db/schema';

import {
  PaginatedResponse,
  PasswordVerificationResult
} from '@/types/types';

// ==========================================
// TYPES
// ==========================================
type MediaRow = typeof media.$inferSelect;
type MediaWithUsage = MediaRow & { galleryCount: number };
type GalleryListMedia = Pick<MediaRow, 'id' | 'thumbnailUrl' | 'fullResUrl' | 'type' | 'originalFilename' | 'caption'>;
type GalleryRow = typeof galleries.$inferSelect;
type GalleryMediaRow = typeof galleryMedia.$inferSelect;

type EnrichedGallery = GalleryRow & { randomMedia: MediaRow | null };
type GalleryWithItems = GalleryRow & { 
  items: { position: number; media: MediaRow | null }[] 
};
type GalleryMediaWithDetails = GalleryMediaRow & { media: MediaRow };

// Simple UUID validation regex
const isValidUUID = (id: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// ==========================================
// 1. USERS HELPERS
// ==========================================
export const userHelpers = {
  findByEmail: async (email: string) => {
    return await db.query.users.findFirst({ 
      where: eq(users.email, email) 
    });
  },
};

// ==========================================
// 2. MEDIA HELPERS
// ==========================================
export const mediaHelpers = {
  create: async (data: typeof media.$inferInsert) => {
    return await db.insert(media).values(data).returning();
  },

  findAll: async (options?: { 
    limit?: number; 
    offset?: number; 
    search?: string;
    filter?: string;
    sortBy?: 'newest' | 'oldest' | 'name';
    excludeIds?: string[]; 
  }): Promise<PaginatedResponse<MediaWithUsage>> => {
    const { limit = 50, offset = 0, search, filter, sortBy = 'newest', excludeIds } = options || {};
    
    const conditions: SQL[] = [];
    
    if (filter && ['image', 'video', 'gif'].includes(filter)) {
      conditions.push(eq(media.type, filter as MediaRow['type']));
    }
    
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      const searchConditions: SQL[] = [
        ilike(media.originalFilename, searchTerm),
        ilike(media.caption, searchTerm),
      ];
      
      if (media.locationName) {
        searchConditions.push(ilike(media.locationName, searchTerm));
      }
      
      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions) as SQL);
      }
    }

    if (excludeIds && excludeIds.length > 0) {
      conditions.push(notInArray(media.id, excludeIds));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause;
    switch (sortBy) {
      case 'oldest':
        orderByClause = [asc(media.uploadedAt)];
        break;
      case 'name':
        orderByClause = [asc(media.originalFilename)];
        break;
      case 'newest':
      default:
        orderByClause = [desc(media.uploadedAt)];
        break;
    }

    const items = await db.query.media.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: orderByClause
    });

    const countResult = await db.select({ count: count() })
      .from(media)
      .where(whereClause);
      
    const total = Number(countResult[0]?.count) || 0;

    const mediaIds = items.map((item) => item.id);
    const usageCounts = mediaIds.length > 0
      ? await db.select({ mediaId: galleryMedia.mediaId, count: count() })
        .from(galleryMedia)
        .where(inArray(galleryMedia.mediaId, mediaIds))
        .groupBy(galleryMedia.mediaId)
      : [];
    const coverMedia = mediaIds.length > 0
      ? await db.select({ coverMediaId: galleries.coverMediaId })
        .from(galleries)
        .where(inArray(galleries.coverMediaId, mediaIds))
      : [];
    const galleryCountByMediaId = new Map(
      usageCounts.map((usage) => [usage.mediaId, Number(usage.count)])
    );
    const coveredMediaIds = new Set(
      coverMedia.map((gallery) => gallery.coverMediaId).filter((id): id is string => id !== null)
    );

    return {
      items: items.map((item) => ({
        ...item,
        galleryCount: (galleryCountByMediaId.get(item.id) || 0) + (coveredMediaIds.has(item.id) ? 1 : 0)
      })),
      total,
      hasMore: offset + limit < total
    };
  },
  
  update: async (id: string, data: Partial<typeof media.$inferInsert>) => {
    if (!isValidUUID(id)) return [];
    return await db.update(media).set(data).where(eq(media.id, id)).returning();
  },
  
  delete: async (id: string) => {
    if (!isValidUUID(id)) return [];
    return await db.delete(media).where(eq(media.id, id)).returning();
  }
};

// ==========================================
// 3. GALLERIES HELPERS
// ==========================================
export const galleryHelpers = {
  create: async (data: typeof galleries.$inferInsert) => {
    return await db.insert(galleries).values(data).returning();
  },
  
  findByNotPrivateId: async (id: string): Promise<GalleryWithItems | undefined> => {
    if (!isValidUUID(id)) return undefined;

    const gallery = await db.query.galleries.findFirst({
      where: and(
        eq(galleries.id, id),
        not(eq(galleries.visibility, 'private')) // ✅ Exclude private galleries
      ),
      with: { 
        coverMedia: true,
        galleryMedia: { 
          with: { 
            media: true
          }, 
          orderBy: [asc(galleryMedia.position)] 
        } 
      }
    });

    if (!gallery) return undefined;

    return {
      ...gallery,
      items: gallery.galleryMedia.map((gm) => ({
        position: gm.position,
        media: gm.media
      }))
    };
  },
  
  findById: async (id: string): Promise<GalleryWithItems | undefined> => {
    if (!isValidUUID(id)) return undefined;

    const gallery = await db.query.galleries.findFirst({
      where: eq(galleries.id, id),
      with: { 
        coverMedia: true,
        galleryMedia: { 
          with: { 
            media: true
          }, 
          orderBy: [asc(galleryMedia.position)] 
        } 
      }
    });

    if (!gallery) return undefined;

    return {
      ...gallery,
      items: gallery.galleryMedia.map((gm) => ({
        position: gm.position,
        media: gm.media
      }))
    };
  },

  findAll: async (options?: { 
    limit?: number; 
    offset?: number; 
    search?: string;
    filter?: string;
    sortBy?: 'newest' | 'oldest' | 'name';
  }): Promise<PaginatedResponse<EnrichedGallery>> => {
    const { limit = 50, offset = 0, search, filter, sortBy = 'newest' } = options || {};
    
    const conditions: SQL[] = [];
    
    if (filter && ['public', 'unlisted', 'password_protected', 'private'].includes(filter)) {
      conditions.push(eq(galleries.visibility, filter as GalleryRow['visibility']));
    }
    
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(ilike(galleries.title, searchTerm));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause;
    switch (sortBy) {
      case 'oldest':
        orderByClause = [asc(galleries.createdAt)];
        break;
      case 'name':
        orderByClause = [asc(galleries.title)];
        break;
      case 'newest':
      default:
        orderByClause = [desc(galleries.createdAt)];
        break;
    }

    const items = await db.query.galleries.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: orderByClause,
      with: {
        coverMedia: {
          columns: {
            id: true,
            thumbnailUrl: true,
            fullResUrl: true,
            type: true,
            originalFilename: true,
            caption: true
          }
        }
      }
    });

    const countResult = await db.select({ count: count() })
      .from(galleries)
      .where(whereClause);
      
    const total = Number(countResult[0]?.count) || 0;

    if (items.length > 0) {
      const galleryIds = items.map((g: { id: string }) => g.id);
      
      const allGalleryMedia = await db.query.galleryMedia.findMany({
        where: inArray(galleryMedia.galleryId, galleryIds),
        with: {
          media: {
            columns: {
              id: true,
              thumbnailUrl: true,
              fullResUrl: true,
              type: true,
              originalFilename: true,
              caption: true
            }
          }
        }
      });
      
      const mediaByGallery = new Map<string, GalleryListMedia | null>();
      const galleryMediaMap = new Map<string, GalleryListMedia[]>();
      
      allGalleryMedia.forEach((gm) => {
        if (!galleryMediaMap.has(gm.galleryId)) {
          galleryMediaMap.set(gm.galleryId, []);
        }
        galleryMediaMap.get(gm.galleryId)!.push(gm.media);
      });
      
      galleryIds.forEach((galleryId: string) => {
        const medias = galleryMediaMap.get(galleryId);
        if (medias && medias.length > 0) {
          const randomIndex = Math.floor(Math.random() * medias.length);
          mediaByGallery.set(galleryId, medias[randomIndex]);
        } else {
          mediaByGallery.set(galleryId, null);
        }
      });
      
      const enrichedItems: EnrichedGallery[] = items.map((gallery) => {
        const randomMedia = mediaByGallery.get(gallery.id) || null;
        return {
          ...gallery,
          randomMedia
        } as EnrichedGallery;
      });

      return {
        items: enrichedItems,
        total,
        hasMore: offset + limit < total
      };
    }

    return {
      items: [] as EnrichedGallery[],
      total,
      hasMore: offset + limit < total
    };
  },

  findPublic: async (options?: { 
    limit?: number; 
    offset?: number;
    search?: string;
    filter?: string;
    sortBy?: 'newest' | 'oldest' | 'title';
  }): Promise<PaginatedResponse<EnrichedGallery>> => {
    const { 
      limit = 12, 
      offset = 0,
      search, 
      filter,
      sortBy = 'newest', 
    } = options || {};

    const conditions: SQL[] = [];

    if (filter && ['public', 'unlisted', 'password_protected', 'private'].includes(filter)) {
      conditions.push(eq(galleries.visibility, filter as GalleryRow['visibility']));
    } else {
      conditions.push(
        or(
          eq(galleries.visibility, 'public'),
          eq(galleries.visibility, 'password_protected')
        )!
      );
    }

    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      const searchConditions: SQL[] = [
        ilike(galleries.title, searchTerm),
      ];
      
      if (galleries.description) {
        searchConditions.push(ilike(galleries.description, searchTerm));
      }
      
      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions) as SQL);
      }
    }

    const whereClause = and(...conditions);

    let orderByClause;
    switch (sortBy) {
      case 'oldest':
        orderByClause = [asc(galleries.createdAt)];
        break;
      case 'title':
        orderByClause = [asc(galleries.title)];
        break;
      case 'newest':
      default:
        orderByClause = [desc(galleries.createdAt)];
        break;
    }

    const items = await db.query.galleries.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: orderByClause,
      with: {
        coverMedia: {
          columns: {
            id: true,
            thumbnailUrl: true,
            fullResUrl: true,
            type: true,
            originalFilename: true,
            caption: true
          }
        }
      }
    });

    const countResult = await db.select({ count: count() })
      .from(galleries)
      .where(whereClause);
  
    const total = Number(countResult[0]?.count) || 0;

    if (items.length > 0) {
      const galleryIds = items.map((g: { id: string }) => g.id);
      
      const allGalleryMedia = await db.query.galleryMedia.findMany({
        where: inArray(galleryMedia.galleryId, galleryIds),
        with: {
          media: {
            columns: {
              id: true,
              thumbnailUrl: true,
              fullResUrl: true,
              type: true,
              originalFilename: true,
              caption: true
            }
          }
        }
      });
      
      const mediaByGallery = new Map<string, GalleryListMedia | null>();
      const galleryMediaMap = new Map<string, GalleryListMedia[]>();
      
      allGalleryMedia.forEach((gm) => {
        if (!galleryMediaMap.has(gm.galleryId)) {
          galleryMediaMap.set(gm.galleryId, []);
        }
        galleryMediaMap.get(gm.galleryId)!.push(gm.media);
      });
      
      galleryIds.forEach((galleryId: string) => {
        const medias = galleryMediaMap.get(galleryId);
        if (medias && medias.length > 0) {
          const randomIndex = Math.floor(Math.random() * medias.length);
          mediaByGallery.set(galleryId, medias[randomIndex]);
        } else {
          mediaByGallery.set(galleryId, null);
        }
      });
      
      const enrichedItems: EnrichedGallery[] = items.map((gallery) => {
        const randomMedia = mediaByGallery.get(gallery.id) || null;
        return {
          ...gallery,
          randomMedia
        } as EnrichedGallery;
      });

      return {
        items: enrichedItems,
        total,
        hasMore: offset + limit < total
      };
    }

    return {
      items: [] as EnrichedGallery[],
      total,
      hasMore: offset + limit < total
    };
  },

  update: async (id: string, data: Partial<typeof galleries.$inferInsert>) => {
    if (!isValidUUID(id)) return [];
    return await db.update(galleries).set(data).where(eq(galleries.id, id)).returning();
  },

  delete: async (id: string) => {
    if (!isValidUUID(id)) return [];
    return await db.delete(galleries).where(eq(galleries.id, id)).returning();
  },

  verifyGalleryPassword: async (galleryId: string, password: string): Promise<PasswordVerificationResult> => {
    if (!isValidUUID(galleryId)) {
      return { success: false, error: 'Invalid gallery ID format' };
    }

    const gallery = await db.query.galleries.findFirst({
      where: eq(galleries.id, galleryId),
      columns: { passwordHash: true, visibility: true }
    });

    if (!gallery) {
      return { success: false, error: 'Gallery not found' };
    }

    if (gallery.visibility !== 'password_protected') {
      return { success: true };
    }

    if (!gallery.passwordHash) {
      return { success: false, error: 'Gallery has no password set' };
    }

    try {
      const isValid = await bcrypt.compare(password, gallery.passwordHash);
      return { success: isValid };
    } catch (error) {
      console.error('Password verification error:', error);
      return { success: false, error: 'Verification failed' };
    }
  }
};

// ==========================================
// 4. GALLERY MEDIA HELPERS
// ==========================================
export const galleryMediaHelpers = {
  addMediaToGallery: async (galleryId: string, mediaId: string, position: number) => {
    if (!isValidUUID(galleryId) || !isValidUUID(mediaId)) return [];
    return await db.insert(galleryMedia).values({ galleryId, mediaId, position }).returning();
  },

  addMediaToGalleryEnd: async (galleryId: string, mediaId: string) => {
    if (!isValidUUID(galleryId) || !isValidUUID(mediaId)) return [];

    const lastItem = await db.query.galleryMedia.findFirst({
      where: eq(galleryMedia.galleryId, galleryId),
      orderBy: [desc(galleryMedia.position)],
      columns: { position: true }
    });

    const nextPosition = lastItem ? lastItem.position + 1 : 0;

    return await db.insert(galleryMedia).values({ 
      galleryId, 
      mediaId, 
      position: nextPosition 
    }).returning();
  },

  getGalleryMediaWithDetails: async (galleryId: string) => {
    if (!isValidUUID(galleryId)) return [];
    const items = await db.query.galleryMedia.findMany({
      where: eq(galleryMedia.galleryId, galleryId),
      orderBy: [asc(galleryMedia.position)],
      with: {
        media: {
          columns: {
            id: true,
            thumbnailUrl: true,
            fullResUrl: true,
            type: true,
            originalFilename: true,
            caption: true,
            uploadedAt: true
          }
        }
      }
    });

    return items;
  },

  getGalleryMediaIds: async (galleryId: string) => {
    if (!isValidUUID(galleryId)) return [];
    return await db.query.galleryMedia.findMany({
      where: eq(galleryMedia.galleryId, galleryId),
      columns: { mediaId: true }
    });
  },

  reorderGallery: async (galleryId: string, orderedMediaIds: string[]) => {
    if (!isValidUUID(galleryId) || orderedMediaIds.length === 0) return [];
    
    const firstQuery = db.update(galleryMedia)
      .set({ position: 0 })
      .where(and(eq(galleryMedia.galleryId, galleryId), eq(galleryMedia.mediaId, orderedMediaIds[0])));
      
    const restQueries = orderedMediaIds.slice(1).map((mediaId, index) => 
      db.update(galleryMedia)
        .set({ position: index + 1 })
        .where(and(eq(galleryMedia.galleryId, galleryId), eq(galleryMedia.mediaId, mediaId)))
    );
    
    return await db.batch([firstQuery, ...restQueries]);
  },
  
  removeMediaFromGallery: async (galleryId: string, mediaId: string) => {
    if (!isValidUUID(galleryId) || !isValidUUID(mediaId)) return [];
    return await db.delete(galleryMedia)
      .where(and(eq(galleryMedia.galleryId, galleryId), eq(galleryMedia.mediaId, mediaId)))
      .returning();
  },

  findByGalleryId: async (galleryId: string, options?: {
    limit?: number;
    offset?: number;
    search?: string;
    filter?: string;
    sortBy?: 'newest' | 'oldest' | 'name' | 'position';
  }): Promise<PaginatedResponse<GalleryMediaWithDetails>> => {
    if (!isValidUUID(galleryId)) {
      return { items: [], total: 0, hasMore: false };
    }

    const { limit = 50, offset = 0, search, filter, sortBy = 'position' } = options || {};
    
    let mediaIdFilter: string[] | undefined = undefined;
    
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      const matchingMedia = await db.select({ id: media.id })
        .from(media)
        .where(or(
          ilike(media.originalFilename, searchTerm),
          ilike(media.caption, searchTerm),
          media.locationName ? ilike(media.locationName, searchTerm) : undefined
        ));
      mediaIdFilter = matchingMedia.map(m => m.id);
      
      if (mediaIdFilter.length === 0) {
        return { items: [], total: 0, hasMore: false };
      }
    }

    if (filter && ['image', 'video', 'gif'].includes(filter)) {
      const filteredMedia = await db.select({ id: media.id })
        .from(media)
        .where(eq(media.type, filter as MediaRow['type']));
      const filteredIds = filteredMedia.map(m => m.id);
      
      if (filteredIds.length === 0) {
        return { items: [], total: 0, hasMore: false };
      }
      
      if (mediaIdFilter) {
        mediaIdFilter = mediaIdFilter.filter(id => filteredIds.includes(id));
        if (mediaIdFilter.length === 0) {
          return { items: [], total: 0, hasMore: false };
        }
      } else {
        mediaIdFilter = filteredIds;
      }
    }

    const conditions = [eq(galleryMedia.galleryId, galleryId)];
    if (mediaIdFilter) {
      conditions.push(inArray(galleryMedia.mediaId, mediaIdFilter));
    }

    const whereClause = and(...conditions);

    const countResult = await db.select({ count: count() })
      .from(galleryMedia)
      .where(whereClause);
    const total = Number(countResult[0]?.count) || 0;

    const items = await db.query.galleryMedia.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [asc(galleryMedia.position)],
      with: {
        media: true
      }
    });

    let sortedItems = items;
    if (sortBy === 'name') {
      sortedItems = [...items].sort((a: GalleryMediaWithDetails, b: GalleryMediaWithDetails) => 
        (a.media.originalFilename || '').localeCompare(b.media.originalFilename || '')
      );
    } else if (sortBy === 'newest') {
      sortedItems = [...items].sort((a: GalleryMediaWithDetails, b: GalleryMediaWithDetails) => 
        new Date(b.media.uploadedAt).getTime() - new Date(a.media.uploadedAt).getTime()
      );
    } else if (sortBy === 'oldest') {
      sortedItems = [...items].sort((a: GalleryMediaWithDetails, b: GalleryMediaWithDetails) => 
        new Date(a.media.uploadedAt).getTime() - new Date(b.media.uploadedAt).getTime()
      );
    }

    return {
      items: sortedItems,
      total,
      hasMore: limit ? offset + limit < total : false
    };
  }
};