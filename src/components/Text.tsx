import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { fonts } from '@/lib/theme';

/**
 * Drop-in for react-native's Text that uses the app's typefaces.
 *
 * Custom fonts ship one file per weight, and asking for fontWeight on top of
 * a single file gives faux-bold (or nothing on Android). So this reads the
 * weight from `style` or the NativeWind `font-*` class, picks the matching
 * file, and drops fontWeight. Change the faces in src/lib/theme.ts `fonts`.
 */
const CLASS_WEIGHT: [RegExp, TextStyle['fontWeight']][] = [
  [/\bfont-(extrabold|black)\b/, '800'],
  [/\bfont-bold\b/, '700'],
  [/\bfont-semibold\b/, '600'],
  [/\bfont-medium\b/, '500'],
];

export function familyFor(weight: TextStyle['fontWeight'] | undefined, display = false): string {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight);
  if (display) return w >= 700 ? fonts.displayBold : fonts.displaySemibold;
  if (w >= 700) return fonts.bold;
  if (w >= 600) return fonts.semibold;
  if (w >= 500) return fonts.medium;
  return fonts.regular;
}

type Props = TextProps & { className?: string; /** Use the headline face. */ display?: boolean };

// React 19: `ref` arrives as an ordinary prop and is passed through in `rest`.
export function Text({ style, className, display, ...rest }: Props) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const fromClass = className ? CLASS_WEIGHT.find(([re]) => re.test(className))?.[1] : undefined;
  const fontFamily = flat.fontFamily ?? familyFor(flat.fontWeight ?? fromClass, display);
  // Strip font-weight classes too, so NativeWind can't add faux-bold on top.
  const cls = className?.replace(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g, '');
  return <RNText {...rest} className={cls} style={[flat, { fontFamily, fontWeight: undefined }]} />;
}
