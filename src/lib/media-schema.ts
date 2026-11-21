import { z } from "astro/zod";
import { LABEL_IDS } from "./content-labels";
import { MEDIA_ID } from "./media";

/** An image uploaded to R2 through the admin (src/lib/media): id + master size. */
export const mediaRefSchema = z.object({
  id: z.string().regex(MEDIA_ID),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  alt: z.string().max(300).optional(),
});

/** Labels on one photo (src/lib/content-labels.ts); left out of the JSON when there are none. */
export const photoLabelsSchema = z.array(z.enum(LABEL_IDS)).optional();

/** gallery-photos/<album>.json in the content repo: the album's R2 photos, in order. */
export const galleryPhotoListSchema = z.object({
  photos: z.array(
    mediaRefSchema.omit({ alt: true }).extend({
      caption: z.object({ vi: z.string().min(1), en: z.string().min(1) }),
      contentWarning: photoLabelsSchema,
    }),
  ),
});
