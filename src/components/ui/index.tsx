import { useContext, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
} from 'react-native';
import { HeaderShownContext } from 'expo-router/react-navigation';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MIN_TAP_TARGET, colors } from '@/lib/theme';

/* ------------------------------------------------------------------ Screen -- */

interface ScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView. Off for screens that own their scrolling. */
  scroll?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
  className?: string;
}

export function Screen({ children, scroll = true, refreshControl, className }: ScreenProps) {
  // Under a navigation header, the header already clears the notch, so only
  // add the top inset (plus room for the floating Help button) on headerless
  // screens like the tabs. Otherwise iOS gets a double gap at the top.
  const hasHeader = useContext(HeaderShownContext);
  const edges: Edge[] = hasHeader ? ['left', 'right'] : ['top', 'left', 'right'];

  const body = scroll ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName={`px-5 pb-16 gap-4 ${hasHeader ? 'pt-2' : 'pt-12'}`}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="never"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  ) : (
    <View className="flex-1">{children}</View>
  );

  // style, not className: NativeWind doesn't style SafeAreaView.
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.cream }}>
      <View className={`flex-1 ${className ?? ''}`}>{body}</View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------- typography -- */

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      accessibilityRole="header"
      className={`text-espresso text-[34px] leading-[41px] font-bold tracking-tight ${className ?? ''}`}
    >
      {children}
    </Text>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      accessibilityRole="header"
      className={`text-espresso text-[17px] leading-[22px] font-semibold ${className ?? ''}`}
    >
      {children}
    </Text>
  );
}

interface TextBlockProps {
  children: ReactNode;
  className?: string;
  numberOfLines?: number;
}

export function Body({ children, className, numberOfLines }: TextBlockProps) {
  return (
    <Text numberOfLines={numberOfLines} className={`text-mocha text-[17px] leading-[23px] ${className ?? ''}`}>
      {children}
    </Text>
  );
}

export function Caption({ children, className, numberOfLines }: TextBlockProps) {
  return (
    <Text numberOfLines={numberOfLines} className={`text-mocha text-[13px] leading-[18px] ${className ?? ''}`}>
      {children}
    </Text>
  );
}

/* -------------------------------------------------------------------- Card -- */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  /** Kept for compatibility. v2 cards have no coloured side stripe. */
  accent?: 'clay' | 'sage' | 'amber' | 'brick' | 'berry';
}) {
  return <View className={`bg-surface rounded-card p-4 ${className ?? ''}`}>{children}</View>;
}

/* ------------------------------------------------------------------ Button -- */

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  busy?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  busy = false,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || busy;

  const base =
    'flex-row items-center justify-center rounded-tile px-5 active:opacity-80';
  const look = {
    primary: 'bg-clay',
    secondary: 'bg-clay-soft',
    quiet: 'bg-sunk',
    danger: 'bg-brick-soft',
  }[variant];
  const textLook = {
    primary: 'text-white',
    secondary: 'text-clay',
    quiet: 'text-espresso',
    danger: 'text-brick',
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(isDisabled), busy }}
      disabled={isDisabled}
      style={{ minHeight: 50 }}
      className={`${base} ${look} ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#FFFFFF' : colors.clay}
          className="mr-2"
        />
      ) : null}
      <Text className={`flex-shrink text-center text-[17px] font-semibold ${textLook}`}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------- Chip -- */

export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityHint,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  const interactive = Boolean(onPress);
  return (
    <Pressable
      disabled={!interactive}
      onPress={onPress}
      accessibilityRole={interactive ? 'button' : 'text'}
      // Screen readers get the on/off state; it is never only the colour.
      accessibilityLabel={interactive ? `${label}, ${selected ? 'on' : 'off'}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      style={interactive ? { minHeight: MIN_TAP_TARGET } : undefined}
      className={`rounded-chip justify-center px-4 ${interactive ? '' : 'h-8 px-3'} ${
        selected ? 'bg-espresso' : interactive ? 'bg-surface border border-border-warm' : 'bg-sunk'
      }`}
    >
      <Text
        className={`${interactive ? 'text-base' : 'text-[15px]'} font-medium ${
          selected ? 'text-white' : 'text-espresso'
        }`}
      >
        {selected ? '✓  ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------- Badge -- */

export function Badge({
  label,
  tone = 'neutral',
  accessibilityLabel,
}: {
  label: string;
  tone?: 'neutral' | 'open' | 'filling' | 'full' | 'chat';
  accessibilityLabel?: string;
}) {
  const look = {
    neutral: 'bg-sunk',
    open: 'bg-sage-soft',
    filling: 'bg-amber-soft',
    full: 'bg-brick-soft',
    chat: 'bg-berry-soft',
  }[tone];
  const textLook = {
    neutral: 'text-mocha',
    open: 'text-sage',
    filling: 'text-amber',
    full: 'text-brick',
    chat: 'text-berry',
  }[tone];

  return (
    <View className={`rounded-md self-start px-2 py-0.5 ${look}`}>
      <Text accessibilityLabel={accessibilityLabel} className={`text-[13px] font-semibold ${textLook}`}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------- Empty/Load -- */

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View className="items-center gap-3 py-12" accessibilityRole="progressbar">
      <ActivityIndicator color={colors.clay} />
      <Caption>{label}</Caption>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="items-center gap-2 py-8">
      <SectionTitle className="text-center">{title}</SectionTitle>
      <Body className="text-center">{body}</Body>
      {action ? <View className="mt-2 w-full">{action}</View> : null}
    </Card>
  );
}

export function ErrorNote({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  const message = typeof error === 'string' ? error : error.message;
  return (
    <Card className="gap-3">
      <SectionTitle>Couldn&apos;t load this</SectionTitle>
      <Body>{message}</Body>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- Toggle --- */

export function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value }}
      style={{ minHeight: MIN_TAP_TARGET }}
      className="flex-row items-center justify-between gap-4 py-2"
    >
      <View className="flex-1">
        <Text className="text-espresso text-base font-medium">{label}</Text>
        {description ? <Caption className="mt-0.5">{description}</Caption> : null}
      </View>
      <View
        className={`h-[31px] w-[51px] justify-center rounded-chip px-0.5 ${value ? 'bg-[#2E9E5B]' : 'bg-[#E3E3DE]'}`}
      >
        <View
          className={`bg-surface h-[27px] w-[27px] rounded-chip ${value ? 'self-end' : 'self-start'}`}
        />
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------ ProgressBar --- */

export function ProgressBar({
  fraction,
  label,
  tone = 'clay',
}: {
  fraction: number;
  label: string;
  tone?: 'clay' | 'berry';
}) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      className="bg-sunk h-3 w-full overflow-hidden rounded-chip"
    >
      <View
        className={`h-full rounded-chip ${tone === 'clay' ? 'bg-clay' : 'bg-berry'}`}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

/* ------------------------------------------------------------- Setup gate -- */

export function ApiNotConfigured({ problem }: { problem?: string | null }) {
  return (
    <Screen>
      <Title>Almost there</Title>
      <Card accent="amber" className="gap-3">
        <SectionTitle>Point the app at the API</SectionTitle>
        {problem ? <Body>{problem}</Body> : null}
        <Caption>
          1. Start the API server: cd server && npm run dev{'\n'}
          2. In development the app finds it automatically on port 8787{'\n'}
          3. For a deployed server, set EXPO_PUBLIC_API_URL in .env{'\n'}
          4. Stop Expo and run: npm run start:clear
        </Caption>
      </Card>
    </Screen>
  );
}
