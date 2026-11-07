import { useState } from 'react';
import { definePanel, z } from '@qoggy/paneon/sdk';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Page,
  Tabs,
  TabsList,
  TabsTrigger,
  usePageAnnotations,
} from '@qoggy/paneon/ui';

function Panel() {
  const [mode, setMode] = useState<'fixed' | 'sticky' | 'static' | 'hidden'>('fixed');
  const [barHeight, setBarHeight] = useState(72);
  const [tall, setTall] = useState(true);
  usePageAnnotations({ onSubmit: async () => {} });
  return (
    <Page title="Annotation positioning acceptance">
      <div className="flex flex-wrap gap-2">
        {(['fixed', 'sticky', 'static', 'hidden'] as const).map((value) => (
          <Button key={value} onClick={() => setMode(value)}>
            {value} bar
          </Button>
        ))}
        <Button onClick={() => setBarHeight(72)}>72px bar</Button>
        <Button onClick={() => setBarHeight(104)}>104px bar</Button>
        <Button onClick={() => setTall(false)}>Short target</Button>
        <Button onClick={() => setTall(true)}>Tall target</Button>
      </div>
      <div className="h-36" />
      <div
        data-testid="top-bar"
        className="z-20 flex w-full items-center justify-center border-b bg-background"
        style={{
          position: mode === 'hidden' ? 'fixed' : mode,
          top: 0,
          left: 0,
          height: barHeight,
          display: mode === 'hidden' ? 'none' : undefined,
        }}
      >
        <Tabs defaultValue="flow">
          <TabsList>
            <TabsTrigger value="flow">Flow</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <button
        type="button"
        className="fixed top-2 right-2 z-30 size-12 rounded-full border bg-background"
      >
        Help
      </button>
      <div className="h-[700px]" />
      <Card
        data-testid="positioning-target"
        style={{ height: tall ? 1400 : 180, scrollMarginTop: 5, scrollMarginBottom: 7 }}
      >
        <CardHeader>
          <CardTitle>Flow target</CardTitle>
        </CardHeader>
        <CardContent>
          <p>The annotation refers to this whole card.</p>
        </CardContent>
      </Card>
      <div className="h-[1100px]" />
    </Page>
  );
}

export default definePanel({
  id: 'annotation-positioning-acceptance',
  requires: { paneon: '__PANEON_TEST_VERSION__' },
  input: z.object({}),

  render: Panel,
});
