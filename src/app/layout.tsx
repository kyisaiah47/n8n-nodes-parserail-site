import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import SmoothScroll from "@/components/SmoothScroll";
import { PRODUCT } from "@/lib/product";
import "./globals.css";

const mono = IBM_Plex_Mono({ variable: "--font-mono", weight: ["400", "500"], subsets: ["latin"] });
export const metadata: Metadata = { title: "n8n-nodes-parserail | ParseRail", description: "The ParseRail n8n community node and its operation surface." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jsonLd = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: PRODUCT.name, applicationCategory: "DeveloperApplication", url: `https://${PRODUCT.host}`, codeRepository: PRODUCT.repoUrl, publisher: { "@type": "Organization", "@id": "https://thecompound.tech/#organization", name: "Compound Labs", url: "https://thecompound.tech" } };
  return <html lang="en" className={mono.variable}><body><SmoothScroll />{children}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /></body></html>;
}
