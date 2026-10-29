import { useState } from 'react';
import { definePanel, z } from '@qoggy/paneon/sdk';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  Input,
  Label,
  Markdown,
  Mermaid,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  Page,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Section,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Spinner,
  Stack,
  StatusBadge,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@qoggy/paneon/ui';

function ComponentsPanel() {
  const [checked, setChecked] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [choice, setChoice] = useState('first');
  const [density, setDensity] = useState('comfortable');
  const [page, setPage] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Page
      title="Component gallery"
      description="The complete first-iteration component set, using the upstream default theme."
    >
      <Stack>
        <Section title="Fields and input">
          <FieldSet>
            <FieldLegend>Example form</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="gallery-name">Name</FieldLabel>
                <FieldContent>
                  <Input id="gallery-name" aria-describedby="gallery-help" />
                  <FieldDescription id="gallery-help">
                    A standard single-line input.
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="gallery-feedback">Multiline feedback</FieldLabel>
                <Textarea id="gallery-feedback" />
              </Field>
              <Field data-invalid>
                <FieldLabel htmlFor="gallery-invalid">Invalid input</FieldLabel>
                <Input id="gallery-invalid" aria-invalid aria-describedby="gallery-error" />
                <FieldError id="gallery-error">Author-provided validation error.</FieldError>
              </Field>
              <FieldSeparator>Options</FieldSeparator>
              <Field orientation="horizontal">
                <Checkbox
                  id="gallery-check"
                  checked={checked}
                  onCheckedChange={(value) => setChecked(value === true)}
                />
                <FieldLabel htmlFor="gallery-check">
                  <FieldTitle>Include details</FieldTitle>
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Switch id="gallery-switch" checked={enabled} onCheckedChange={setEnabled} />
                <FieldLabel htmlFor="gallery-switch">Enable option</FieldLabel>
              </Field>
              <Checkbox aria-label="Disabled checkbox" disabled />
              <Switch aria-label="Disabled switch" disabled />
              <Label htmlFor="gallery-select">Environment</Label>
              <Select
                defaultValue="preview"
                items={{
                  preview: 'Preview',
                  staging: 'Staging',
                  production: 'Production (disabled)',
                }}
              >
                <SelectTrigger id="gallery-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Available</SelectLabel>
                    <SelectItem value="preview">Preview</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectItem value="production" disabled>
                    Production (disabled)
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldGroup>
          </FieldSet>
        </Section>
        <Section title="Navigation">
          <NavigationMenu aria-label="Gallery navigation">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Explore components</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <NavigationMenuLink href="#core" onClick={(event) => event.preventDefault()}>
                    Core components
                  </NavigationMenuLink>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </Section>
        <Section title="Cards and choices">
          <Card>
            <CardHeader>
              <CardTitle>Review proposal</CardTitle>
              <CardDescription>Cards arrange content; your code owns behavior.</CardDescription>
              <CardAction>
                <Badge variant="outline">Draft</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <RadioGroup value={choice} onValueChange={setChoice} aria-label="Gallery choice">
                <Stack direction="row">
                  <RadioGroupItem id="gallery-first" value="first" />
                  <Label htmlFor="gallery-first">First option</Label>
                  <RadioGroupItem id="gallery-second" value="second" />
                  <Label htmlFor="gallery-second">Second option</Label>
                  <RadioGroupItem value="disabled" disabled aria-label="Disabled option" />
                </Stack>
              </RadioGroup>
            </CardContent>
            <CardFooter>
              <StatusBadge variant="secondary">Ready for review</StatusBadge>
            </CardFooter>
          </Card>
        </Section>
        <Section title="Tabs and disclosure">
          <Tabs defaultValue="summary">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Disabled tab
              </TabsTrigger>
            </TabsList>
            <TabsContent value="summary">Summary content</TabsContent>
            <TabsContent value="details">Detailed content</TabsContent>
          </Tabs>
          <Accordion multiple>
            <AccordionItem value="one">
              <AccordionTrigger>First explanation</AccordionTrigger>
              <AccordionContent>First explanation content</AccordionContent>
            </AccordionItem>
            <AccordionItem value="two">
              <AccordionTrigger>Second explanation</AccordionTrigger>
              <AccordionContent>Second explanation content</AccordionContent>
            </AccordionItem>
          </Accordion>
          <Collapsible>
            <CollapsibleTrigger
              render={<Button variant="outline">Toggle extra information</Button>}
            />
            <CollapsibleContent>Extra information</CollapsibleContent>
          </Collapsible>
        </Section>
        <Section title="Overlays">
          <Stack direction="row" wrap>
            <Dialog>
              <DialogTrigger render={<Button variant="outline">Open details dialog</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Details dialog</DialogTitle>
                  <DialogDescription>
                    Focus stays inside while this dialog is open.
                  </DialogDescription>
                </DialogHeader>
                <Input aria-label="Dialog field" />
                <DialogFooter>
                  <DialogClose render={<Button>Close details</Button>} />
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline">Open confirmation</Button>} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm local choice?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This only changes local React state.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel choice</AlertDialogCancel>
                  <AlertDialogAction onClick={() => setConfirmed(true)}>
                    Confirm choice
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <TooltipProvider delay={0}>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline">Explain this control</Button>} />
                <TooltipContent>Helpful explanation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline">Open actions menu</Button>} />
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Display</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setConfirmed(true)}>
                    Mark reviewed<DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>Unavailable action</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
                  Show details
                </DropdownMenuCheckboxItem>
                <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
                  <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>More options</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem>Nested option</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger render={<Button variant="outline">Open quick form</Button>} />
              <PopoverContent>
                <Label htmlFor="popover-value">Quick note</Label>
                <Input id="popover-value" />
              </PopoverContent>
            </Popover>
          </Stack>
          <p role="status">{confirmed ? 'Choice confirmed' : 'No choice confirmed'}</p>
        </Section>
        <Section title="Feedback">
          <Alert>
            <AlertTitle>Ready</AlertTitle>
            <AlertDescription>Author-controlled status feedback.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Example error</AlertTitle>
            <AlertDescription>No request was sent.</AlertDescription>
          </Alert>
          <Spinner aria-label="Example loading" />
          <Button disabled>Disabled button</Button>
        </Section>
        <Section title="Table and pagination">
          <Table>
            <TableCaption>Example table</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Page {page}</TableCell>
                <TableCell>
                  <Badge>Available</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Two local pages</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={page === 1}
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(1);
                  }}
                />
              </PaginationItem>
              {[1, 2].map((number) => (
                <PaginationItem key={number}>
                  <PaginationLink
                    href="#"
                    isActive={page === number}
                    onClick={(event) => {
                      event.preventDefault();
                      setPage(number);
                    }}
                  >
                    {number}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page === 2}
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(2);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Section>
        <Section title="Mermaid diagrams">
          <Mermaid code={'flowchart LR\n  Question --> Diagram\n  Diagram --> Understanding'} />
        </Section>
        <Section title="Read-only content">
          <CodeBlock
            code={'const message = "<script>never executes</script>";\nconsole.log(message);'}
            language="typescript"
          />
          <Markdown>
            {
              '# Markdown example\n\nA **read-only** document with [a link](https://example.com).\n\n> A quoted explanation.\n\n- [x] Reviewed\n- [ ] Pending\n\n| Option | Status |\n| --- | --- |\n| A | ~~Old~~ Ready |\n\n```json\n{"enabled": true}\n```'
            }
          </Markdown>
        </Section>
      </Stack>
    </Page>
  );
}
export default definePanel({
  id: 'components-panel',
  requires: { paneon: '__PANEON_TEST_VERSION__' },
  input: z.object({}),
  events: {},
  render: ComponentsPanel,
});
