import { agent, annotationValueSchema, definePanel, z } from '@qoggy/paneon/sdk';
import {
  Image,
  AnnotationText,
  DiffView,
  Markdown,
  Mermaid,
  Page,
  useAnnotations,
  usePageAnnotations,
} from '@qoggy/paneon/ui';

const image = './tests/fixtures/checkout.svg';
const diagram = 'flowchart LR\n  Cart --> Payment --> Complete';
const document =
  '# 😀 Checkout\r\n\r\n![Checkout](' +
  image +
  ')\r\n\r\n~~~mermaid\r\n' +
  diagram.replaceAll('\n', '\r\n') +
  '\r\n~~~';
const pure = '```mermaid\n' + diagram + '\n```\n\n```mermaid\n' + diagram + '\n```';
const linked =
  '# Linked image\n\n[![Linked checkout](' +
  image +
  ')](#linked-image)\n\n![Reference checkout][checkout]\n\n[checkout]: ' +
  image;
const frontmatter =
  '---\r\ntitle: Checkout\r\n---\r\n\r\n~~~mermaid\r\n' +
  diagram.replaceAll('\n', '\r\n') +
  '\r\n~~~';
const annotation = annotationValueSchema(z.unknown()).shape.annotations.element;
const feedbackSchema = z.object({
  annotations: z.array(
    z.object({ targets: annotation.shape.targets, comment: annotation.shape.comment }),
  ),
});

function Panel() {
  usePageAnnotations({
    onSubmit: async ({ annotations }) => {
      await agent.emit('media-feedback', {
        annotations: annotations.map(({ targets, comment }) => ({ targets, comment })),
      });
    },
  });
  const annotations = useAnnotations();
  return (
    <Page title="Media annotation acceptance">
      <section data-testid="standalone-image">
        <h2>Standalone image</h2>
        <Image src={image} alt="Checkout" annotationTarget={{ image: 'checkout', version: 1 }} />
      </section>
      <section data-testid="standalone-mermaid">
        <h2>Standalone Mermaid</h2>
        <Mermaid code={diagram} annotationTarget="standalone-flow" />
      </section>
      <section data-testid="markdown">
        <h2>Markdown image and Mermaid</h2>
        <Markdown annotationTarget="checkout-doc">{document}</Markdown>
      </section>
      <section data-testid="pure-media">
        <h2>Identical Mermaid-only blocks</h2>
        <Markdown annotationTarget="pure-media">{pure}</Markdown>
      </section>
      <section data-testid="plain">
        <h2>Without annotations</h2>
        <Image src={image} alt="Unannotated checkout" />
        <Mermaid code={diagram} />
      </section>
      <section data-testid="linked-image">
        <h2>Linked and reference-style images</h2>
        <Markdown annotationTarget="linked-images">{linked}</Markdown>
      </section>
      <section data-testid="frontmatter">
        <h2>Mermaid after frontmatter</h2>
        <Markdown annotationTarget="frontmatter-doc">{frontmatter}</Markdown>
      </section>
      <section data-testid="text-annotation">
        <h2>Existing text annotations</h2>
        <AnnotationText target="existing-text">
          Existing text annotation remains available.
        </AnnotationText>
      </section>
      <section data-testid="diff-annotation">
        <h2>Existing diff annotations</h2>
        <DiffView
          oldText="const count = 1;\n"
          newText="const count = 2;\n"
          annotationTargets={{ old: 'diff-old', new: 'diff-new' }}
        />
      </section>
      <pre data-testid="draft" className="text-xs whitespace-pre-wrap">
        {JSON.stringify(annotations.value)}
      </pre>
      <pre data-testid="source" className="sr-only">
        {document}
      </pre>
      <pre data-testid="frontmatter-source" className="sr-only">
        {frontmatter}
      </pre>
      <pre data-testid="linked-source" className="sr-only">
        {linked}
      </pre>
    </Page>
  );
}

export default definePanel({
  id: 'media-annotation-acceptance',
  requires: { paneon: '__PANEON_TEST_VERSION__' },
  input: z.object({}).strict(),
  events: { 'media-feedback': feedbackSchema },
  render: Panel,
});
