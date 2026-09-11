// app/api/gallery-media/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { galleryMediaHelpers } from '@/lib/db-helpers';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { galleryId, mediaId } = await req.json();

  try {
    await galleryMediaHelpers.addMediaToGalleryEnd(galleryId, mediaId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to add media' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const galleryId = searchParams.get('galleryId');
  const mediaId = searchParams.get('mediaId');

  if (!galleryId || !mediaId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    await galleryMediaHelpers.removeMediaFromGallery(galleryId, mediaId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to remove media' }, { status: 500 });
  }
}