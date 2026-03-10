import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";

export type ReadableMessageBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string; marker: string };

function splitLongParagraph(text: string) {
  const compact = text.trim();
  if (!compact || compact.includes("\n")) {
    return [compact];
  }

  const fallbackSegments =
    compact
      .match(/[^，,。！？!?；;]+[，,。！？!?；;]?/g)
      ?.map((part) => part.trim())
      .filter(Boolean) || [compact];

  const hasDenseChineseClauses = fallbackSegments.length >= 4 && compact.length >= 36;
  if (compact.length < 60 && !hasDenseChineseClauses) {
    return [compact];
  }

  const primarySegments =
    compact
      .match(/[^。！？!?；;]+[。！？!?；;]?/g)
      ?.map((part) => part.trim())
      .filter(Boolean) || [];

  const segments =
      primarySegments.length >= 3
        ? primarySegments
      : fallbackSegments;

  if (segments.length < 3) {
    return [compact];
  }

  const paragraphs: string[] = [];
  let bucket = "";
  let sentenceCount = 0;

  const joinSentence = (left: string, right: string) => {
    if (!left) return right;
    const needsSpace = /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
    return `${left}${needsSpace ? " " : ""}${right}`;
  };

  for (const sentence of segments) {
    bucket = joinSentence(bucket, sentence);
    sentenceCount += 1;
    if (bucket.length >= 86 || sentenceCount >= 2) {
      paragraphs.push(bucket.trim());
      bucket = "";
      sentenceCount = 0;
    }
  }

  if (bucket.trim()) {
    paragraphs.push(bucket.trim());
  }

  return paragraphs.length > 1 ? paragraphs : [compact];
}

export function buildReadableMessageBlocks(text: string): ReadableMessageBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const rawParagraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => splitLongParagraph(part));

  const blocks: ReadableMessageBlock[] = [];

  for (const paragraph of rawParagraphs) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > 1) {
      for (const line of lines) {
        const unordered = /^([*-]|•)\s+(.*)$/.exec(line);
        if (unordered) {
          blocks.push({ kind: "bullet", marker: unordered[1], text: unordered[2].trim() });
          continue;
        }
        const ordered = /^(\d+[.)])\s+(.*)$/.exec(line);
        if (ordered) {
          blocks.push({ kind: "bullet", marker: ordered[1], text: ordered[2].trim() });
          continue;
        }
        if (line.length <= 42 && /[:：]$/.test(line)) {
          blocks.push({ kind: "heading", text: line });
        } else {
          blocks.push({ kind: "paragraph", text: line });
        }
      }
      continue;
    }

    const line = lines[0] || paragraph;
    if (line.length <= 42 && /[:：]$/.test(line)) {
      blocks.push({ kind: "heading", text: line });
      continue;
    }
    blocks.push({ kind: "paragraph", text: line });
  }

  return blocks;
}

type ReadableMessageTextProps = {
  text: string;
  containerStyle?: StyleProp<ViewStyle>;
  paragraphTextStyle?: StyleProp<TextStyle>;
  headingTextStyle?: StyleProp<TextStyle>;
  bulletTextStyle?: StyleProp<TextStyle>;
  bulletMarkerStyle?: StyleProp<TextStyle>;
};

export function ReadableMessageText({
  text,
  containerStyle,
  paragraphTextStyle,
  headingTextStyle,
  bulletTextStyle,
  bulletMarkerStyle,
}: ReadableMessageTextProps) {
  const blocks = buildReadableMessageBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <View style={[styles.container, containerStyle]}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <Text key={`heading-${index}`} style={[styles.heading, headingTextStyle]}>
              {block.text}
            </Text>
          );
        }
        if (block.kind === "bullet") {
          return (
            <View key={`bullet-${index}`} style={styles.bulletRow}>
              <Text style={[styles.bulletMarker, bulletMarkerStyle]}>{block.marker}</Text>
              <Text style={[styles.paragraph, styles.bulletText, bulletTextStyle]}>{block.text}</Text>
            </View>
          );
        }
        return (
          <Text key={`paragraph-${index}`} style={[styles.paragraph, paragraphTextStyle]}>
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  heading: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 27,
    fontWeight: "500",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletMarker: {
    marginTop: 1,
    minWidth: 16,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "800",
  },
  bulletText: {
    flex: 1,
  },
});
