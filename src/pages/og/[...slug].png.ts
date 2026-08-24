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
      published: post.data.published.toISOString(),
    },
  }));
}) satisfies GetStaticPaths;

const fontsDir = join(process.cwd(), "src/assets/fonts");
const avatarPath = join(process.cwd(), "src/assets/16-bit-avatar-cutout.png");
const bonsaiPath = join(process.cwd(), "src/assets/noun-bonsai-6879622.optimized.svg");

async function loadAssets() {
  const [regular, semibold, avatar] = await Promise.all([
    readFile(join(fontsDir, "SourceSans3-Regular.ttf")),
    readFile(join(fontsDir, "SourceSans3-Semibold.ttf")),
    readFile(avatarPath),
  ]);
  const avatarMetadata = await sharp(avatar).metadata();
  const cropSize = Math.round(Math.min(avatarMetadata.width ?? 640, avatarMetadata.height ?? 640) / 1.16);
  const zoomedAvatar = await sharp(avatar)
    .extract({
      left: Math.round(((avatarMetadata.width ?? 640) - cropSize) / 2),
      top: Math.round(((avatarMetadata.height ?? 640) - cropSize) / 2),
      width: cropSize,
      height: cropSize,
    })
    .png()
    .toBuffer();
  return {
    regular,
    semibold,
    avatar: `data:image/png;base64,${zoomedAvatar.toString("base64")}`,
  };
}

export const GET: APIRoute = async ({ props }) => {
  const { title, excerpt, topic, published } = props as {
    title: string;
    excerpt?: string;
    topic?: string;
    published: string;
  };
  const { regular, semibold, avatar } = await loadAssets();
  const publishedLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(published));

  // Flexoki dark theme tokens from global.css
  const bg = "#100F0F";
  const text = "#E6E4D9";
  const muted = "#878580";
  const accent = "#879A39";
  const markerSvg = (await readFile(bonsaiPath, "utf8"))
    .replace(/<text[\s\S]*?<\/text>/g, "")
    .replace('viewBox="-5 -10 110 135"', 'viewBox="15 0 75 100"')
    .replace("<path ", `<path fill="${accent}" `);
  const marker = `data:image/svg+xml;base64,${Buffer.from(markerSvg).toString("base64")}`;

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
          padding: "64px 80px 104px",
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
                width: "100%",
                justifyContent: "space-between",
                alignItems: "center",
              },
              children: [
                {
                  type: "img",
                  props: {
                    style: {
                      width: "60px",
                      height: "60px",
                    },
                    src: marker,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: 22,
                      letterSpacing: "0.2em",
                      color: muted,
                      fontWeight: 600,
                    },
                    children: "FIELD NOTES",
                  },
                },
              ],
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
                fontSize: 26,
                color: muted,
                fontWeight: 400,
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "20px",
                    },
                    children: [
                      {
                        type: "img",
                        props: {
                          src: avatar,
                          style: {
                            width: "88px",
                            height: "88px",
                            borderRadius: "9999px",
                            backgroundColor: "#24231f",
                          },
                        },
                      },
                      {
                        type: "div",
                        props: {
                          children: "Kamau Wanyee",
                        },
                      },
                    ],
                  },
                },
                ...((topic || publishedLabel) ? [{
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      fontSize: 22,
                    },
                    children: [
                      {
                        type: "div",
                        props: {
                          children: publishedLabel,
                        },
                      },
                      ...(topic ? [
                        {
                          type: "div",
                          props: {
                            style: { color: "#4d4c47" },
                            children: "·",
                          },
                        },
                        {
                          type: "div",
                          props: {
                            style: {
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: accent,
                            },
                            children: topic,
                          },
                        },
                      ] : []),
                    ],
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
