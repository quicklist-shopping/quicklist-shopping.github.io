import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

export function ListErrorDialog({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} aria-labelledby="list-error-title">
      <DialogTitle id="list-error-title">Quicklist</DialogTitle>
      <DialogContent>{message}</DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" autoFocus>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
