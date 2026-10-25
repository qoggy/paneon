import { useState } from 'react';
import { agent, definePanel, z } from '@qoggy/paneon/sdk';
import {
  Badge,
  Button,
  Input,
  Label,
  Page,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Stack,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@qoggy/paneon/ui';

function TablePanel() {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    name: `Option ${index + 1}`,
    status: index % 2 ? 'Draft' : 'Ready',
  })).filter((row) => row.name.toLowerCase().includes(filter.toLowerCase()));
  const pageSize = 4;
  const pageCount = Math.ceil(rows.length / pageSize);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  async function select(id: number) {
    try {
      await agent.emit('row-selected', { id });
      setMessage(`Option ${id} submitted to AI.`);
    } catch {
      setMessage('The selection was not saved.');
    }
  }
  return (
    <Page
      title="Table with actions"
      description="Filtering, page boundaries, and row actions belong to this component."
    >
      <Stack>
        <Label htmlFor="filter">Filter options</Label>
        <Input
          id="filter"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        />
        <Table>
          <TableCaption>Local example options</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.status}</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="outline" onClick={() => void select(row.id)}>
                    Choose {row.name}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>{rows.length} matching options</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        {!rows.length && <p>No matching options. Clear the filter to see all rows.</p>}
        {pageCount > 0 && (
          <Pagination aria-label="Options pages">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={currentPage === 1}
                  onClick={(event) => {
                    event.preventDefault();
                    if (currentPage > 1) setPage(currentPage - 1);
                  }}
                />
              </PaginationItem>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <PaginationItem key={number}>
                  <PaginationLink
                    href="#"
                    isActive={currentPage === number}
                    onClick={(event) => {
                      event.preventDefault();
                      setPage(number);
                    }}
                  >
                    {number}
                  </PaginationLink>
                </PaginationItem>
              ))}
              {pageCount > 3 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={currentPage === pageCount}
                  onClick={(event) => {
                    event.preventDefault();
                    if (currentPage < pageCount) setPage(currentPage + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
        {message && <p role="status">{message}</p>}
      </Stack>
    </Page>
  );
}
export default definePanel({
  id: 'table-panel',
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input: z.object({}),
  events: { 'row-selected': z.object({ id: z.number().int().positive() }) },
  render: TablePanel,
});
