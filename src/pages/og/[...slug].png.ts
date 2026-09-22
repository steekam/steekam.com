import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";

export const prerender = true;

export const getStaticPaths = (async () => {
  const posts = await getCollection("posts");
  return [
    {
      params: { slug: 'home' },
      props: {
        title: 'Kamau Wanyee',
        excerpt: 'Field notes on reliable product engineering.',
        topic: 'Product developer',
      },
    },
    {
      params: { slug: 'ted-lasso-wisdom' },
      props: {
        title: 'Find the line for this moment.',
        excerpt: 'Search Ted Lasso quotes by situation. Get the episode.',
        topic: 'Fan-made experiment',
        theme: 'lasso',
      },
    },
    ...posts.map((post) => ({
    params: { slug: post.id },
    props: {
      title: post.data.title,
      excerpt: post.data.excerpt,
      topic: post.data.topics?.[0],
      published: post.data.published.toISOString(),
    },
    })),
  ];
}) satisfies GetStaticPaths;

const fontsDir = join(process.cwd(), "src/assets/fonts");
const avatarPath = join(process.cwd(), "src/assets/16-bit-avatar-cutout.png");
const bonsaiPath = join(process.cwd(), "src/assets/noun-bonsai-6879622.optimized.svg");
const lassoMarkPath = join(process.cwd(), "public/images/the-lasso-way/ted-lasso-mark-512.png");

async function loadAssets() {
  const [regular, semibold, avatar, lassoMark] = await Promise.all([
    readFile(join(fontsDir, "SourceSans3-Regular.ttf")),
    readFile(join(fontsDir, "SourceSans3-Semibold.ttf")),
    readFile(avatarPath),
    readFile(lassoMarkPath),
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
    lassoMark: `data:image/png;base64,${lassoMark.toString("base64")}`,
  };
}

export const GET: APIRoute = async ({ props }) => {
  const { title, excerpt, topic, published, theme } = props as {
    title: string;
    excerpt?: string;
    topic?: string;
    published?: string;
    theme?: string;
  };
  const { regular, semibold, avatar, lassoMark } = await loadAssets();
  const publishedLabel = published && new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(published));

  const isLasso = theme === 'lasso';
  if (isLasso) {
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
            padding: "52px 72px 46px",
            backgroundColor: "#0A2026",
            color: "#F5F0DD",
            fontFamily: "Source Sans 3",
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "space-between", gap: "48px" },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", width: "62%" },
                      children: [
                        {
                          type: "div",
                          props: {
                            style: { fontSize: 78, fontWeight: 600, lineHeight: 0.96, letterSpacing: "-0.045em" },
                            children: "The Lasso Away",
                          },
                        },
                        {
                          type: "div",
                          props: {
                            style: { maxWidth: "560px", marginTop: "26px", color: "#C1C5B1", fontSize: 30, lineHeight: 1.2 },
                            children: "Fan-made quote collection.",
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", alignItems: "center", width: "34%" },
                      children: [
                        {
                          type: "img",
                          props: { src: lassoMark, style: { width: "300px", height: "300px", objectFit: "contain" } },
                        },
                        {
                          type: "div",
                          props: {
                            style: { marginTop: "-8px", padding: "10px 18px", backgroundColor: "#EFC84B", color: "#0A2026", fontSize: 24, fontWeight: 600, letterSpacing: "0.06em", transform: "rotate(4deg)" },
                            children: "BELIEVE",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(245,240,221,.24)", paddingTop: "20px", color: "#EFC84B", fontSize: 18, letterSpacing: "0.08em" },
                children: [
                  { type: "div", props: { children: "STEEKAM.ME" } },
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
          { name: "Source Sans 3", data: regular, weight: 400, style: "normal" },
          { name: "Source Sans 3", data: semibold, weight: 600, style: "normal" },
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
  }

  // Flexoki dark theme tokens from global.css
  const bg = isLasso ? "#0B2724" : "#100F0F";
  const text = isLasso ? "#F4F0DC" : "#E6E4D9";
  const muted = isLasso ? "#A8AD99" : "#878580";
  const accent = isLasso ? "#F7C949" : "#879A39";
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
