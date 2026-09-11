import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { mediaHelpers } from '@/lib/db-helpers';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(10, Number(searchParams.get('limit')) || 20));
    const type = searchParams.get('type');
    const filter = type === 'image' || type === 'video' || type === 'gif' ? type : undefined;
    const sortParam = searchParams.get('sortBy');
    const sortBy = sortParam === 'oldest' || sortParam === 'name' ? sortParam : 'newest';
    const result = await mediaHelpers.findAll({
      limit,
      offset: (page - 1) * limit,
      search: searchParams.get('search') || undefined,
      filter,
      sortBy,
    });

    return NextResponse.json({
      items: result.items,
      total: result.total,
      hasMore: result.hasMore,
      page,
    });
  } catch (error) {
    console.error('Media fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await req.json();
    
    const {
      cloudinaryPublicId,
      url,
      thumbnailUrl,
      width,
      height,
      title,
      locationName,
      coordinates,
      originalFilename,
      mimeType,
      exifData, // ✅ Added: Destructure EXIF data from request
    } = data;

    if (!cloudinaryPublicId || !url) {
      return NextResponse.json({ error: 'Missing Cloudinary data' }, { status: 400 });
    }

    // Parse coordinates for Postgres Point [longitude, latitude]
    let parsedCoordinates: [number, number] | null = null;
    if (coordinates) {
      const parts = String(coordinates).split(',').map((p: string) => p.trim());
      if (parts.length === 2) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (!isNaN(x) && !isNaN(y)) {
          parsedCoordinates = [x, y];
        }
      }
    }

    // Create database record
    const newMedia = await mediaHelpers.create({
      type: mimeType?.startsWith('video') ? 'video' : 'image',
      thumbnailUrl,
      fullResUrl: url,
      originalFilename,
      mimeType,
      caption: title || null,
      width: parseInt(width, 10) || null,
      height: parseInt(height, 10) || null,
      durationSeconds: null, 
      exifData: exifData || null, // ✅ Save EXIF data to database
      locationName: locationName || null,
      coordinates: parsedCoordinates,
    });

    return NextResponse.json(newMedia[0], { status: 201 });

  } catch (error) {
    console.error('Media save error:', error);
    return NextResponse.json({ error: 'Failed to save media metadata' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
  }

  try {
    const deletedMedia = await mediaHelpers.delete(id);
    if (deletedMedia.length === 0) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Media deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
  }
}