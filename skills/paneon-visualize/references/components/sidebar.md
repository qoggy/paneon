# Sidebar

## Use when

Build a grouped sidebar directory or application navigation with an active item and optional collapsing.

## Import

```ts
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInput,
  SidebarSeparator,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
  useSidebar,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Wrap Sidebar and its adjacent content in SidebarProvider.
// Default wrapper: flex, full width, minimum viewport height.
interface SidebarProviderProps {
  defaultOpen?: boolean; // default true; expanded on desktop
  open?: boolean; // controlled desktop state
  onOpenChange?: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties; // --sidebar-width (16rem), --sidebar-width-icon (3rem)
}

interface SidebarProps {
  side?: 'left' | 'right'; // default 'left'
  variant?: 'sidebar' | 'floating' | 'inset'; // default 'sidebar'
  collapsible?: 'offcanvas' | 'icon' | 'none'; // default 'offcanvas'
  className?: string;
  // 'none' stays in normal flow; other modes use a fixed desktop sidebar.
}

interface SidebarMenuButtonProps {
  isActive?: boolean; // default false; visual active state
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
  render?: React.ReactElement; // e.g. <a href="#configuration" />
  className?: string;
  // Native button props accepted. Set aria-current on the active navigation link.
}

interface SidebarMenuSubButtonProps {
  isActive?: boolean;
  size?: 'sm' | 'md';
  render?: React.ReactElement; // default element is <a>
  className?: string;
}

interface SidebarMenuActionProps {
  showOnHover?: boolean; // default false
  render?: React.ReactElement;
  className?: string;
}

interface SidebarMenuSkeletonProps {
  showIcon?: boolean; // default false
  className?: string;
}

// GroupLabel and GroupAction also accept render for Base UI composition.
// Header, Footer, Content, Group, GroupContent and MenuBadge accept <div> props.
// Menu and MenuSub accept <ul> props; MenuItem and MenuSubItem accept <li> props.
// SidebarInput, SidebarSeparator and SidebarTrigger accept Input, Separator and Button props.
// SidebarInset renders <main>; SidebarRail renders a toggle <button>.
// useSidebar() returns { state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }.
// state is 'expanded' | 'collapsed'. Cmd/Ctrl+B toggles the sidebar.
// Toggling desktop state writes the upstream sidebar_state cookie; initial state comes from props.
```

A directory that stays inside a centered `Page` can use a non-collapsing sidebar:

```tsx
<Page title="Review">
  <SidebarProvider className="min-h-0 items-start gap-8">
    <Sidebar collapsible="none" className="shrink-0 bg-transparent">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive aria-current="page" render={<a href="#cookie" />}>
                  Cookie
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
    <section id="cookie" className="min-w-0 flex-1">
      ...
    </section>
  </SidebarProvider>
</Page>
```

Sidebar provides the navigation layout and active styling. Links or the page's own state determine what happens when an item is selected. `isActive` does not select or mount content automatically. Unlike Tabs, its items use normal link/button keyboard behavior rather than arrow-key tab selection.
