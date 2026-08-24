import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";

export const prerender = true;

export const getStaticPaths = (async () => {
  const posts = await getCollection("posts");
  return posts.map((post) => ({
    params: { slug: post.id },
    props: {
      title: post.data.title,
      excerpt: post.data.excerpt,
      topic: post.data.topics?.[0],
    },
  }));
}) satisfies GetStaticPaths;

const fontsDir = join(process.cwd(), "src/assets/fonts");

async function loadFonts() {
  const [regular, semibold] = await Promise.all([
    readFile(join(fontsDir, "SourceSans3-Regular.ttf")),
    readFile(join(fontsDir, "SourceSans3-Semibold.ttf")),
  ]);
  return { regular, semibold };
}

export const GET: APIRoute = async ({ props }) => {
  const { title, excerpt, topic } = props as { title: string; excerpt?: string; topic?: string };
  const { regular, semibold } = await loadFonts();

  // Flexoki dark theme tokens from global.css
  const bg = "#100F0F";
  const text = "#E6E4D9";
  const muted = "#878580";
  const accent = "#879A39";

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "72px 80px",
          backgroundColor: bg,
          color: text,
          fontFamily: "Source Sans 3",
        },
                children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                width: "64px",
                height: "4px",
                backgroundColor: accent,
              },
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                flexGrow: 1,
                justifyContent: "center",
                paddingTop: "24px",
                paddingBottom: "24px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: title.length > 60 ? 52 : 64,
                      fontWeight: 600,
                      lineHeight: 1.15,
                      letterSpacing: "-0.02em",
                      maxWidth: "1000px",
                    },
                    children: title,
                  },
                },
                ...(excerpt ? [{
                  type: "div",
                  props: {
                    style: {
                      fontSize: 28,
                      lineHeight: 1.3,
                      color: muted,
                      marginTop: "24px",
                      maxWidth: "980px",
                    },
                    children: excerpt,
                  },
                }] : []),
              ],
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                fontSize: 28,
                color: muted,
                fontWeight: 400,
              },
                children: [
                {
                  type: "div",
                  props: {
                    children: "Kamau Wanyee",
                  },
                },
                {
                  type: "div",
                  props: {
                    children: "steekam.me",
                  },
                },
                ...(topic ? [{
                  type: "div",
                  props: {
                    children: topic,
                  },
                }] : []),
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Source Sans 3",
          data: regular,
          weight: 400,
          style: "normal",
        },
        {
          name: "Source Sans 3",
          data: semibold,
          weight: 600,
          style: "normal",
        },
      ],
    },
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
