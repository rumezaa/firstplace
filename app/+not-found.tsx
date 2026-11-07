import { Link } from 'expo-router';

import { Body, Card, Screen, Title } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen>
      <Title>Nothing here</Title>
      <Card className="gap-3">
        <Body>That screen does not exist.</Body>
        <Link href="/" className="text-clay text-base font-semibold">
          Back to the map
        </Link>
      </Card>
    </Screen>
  );
}
