import type { MetadataRoute } from "next";
import { PRODUCT } from "@/lib/product";
export default function sitemap(): MetadataRoute.Sitemap { return [{ url: `https://${PRODUCT.host}/`, lastModified: new Date("2026-10-02") }]; }
