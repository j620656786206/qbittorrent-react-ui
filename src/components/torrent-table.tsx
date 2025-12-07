import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// A basic type for the torrent object, we can expand this later
// based on the data from the API.
export type Torrent = {
  hash: string;
  name: string;
  size: number;
  progress: number;
  state: string;
  dlspeed: number;
  upspeed: number;
};

// Helper function to format bytes into KB, MB, GB, etc.
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function TorrentTable({ torrents }: { torrents: Torrent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40%]">Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Down Speed</TableHead>
          <TableHead>Up Speed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {torrents.map((torrent) => (
          <TableRow key={torrent.hash}>
            <TableCell className="font-medium">{torrent.name}</TableCell>
            <TableCell>{formatBytes(torrent.size)}</TableCell>
            <TableCell>{(torrent.progress * 100).toFixed(1)}%</TableCell>
            <TableCell>{torrent.state}</TableCell>
            <TableCell>{formatBytes(torrent.dlspeed)}/s</TableCell>
            <TableCell>{formatBytes(torrent.upspeed)}/s</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
