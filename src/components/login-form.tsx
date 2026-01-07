import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LoginFormProps {
  onLoginSuccess: () => void;
  initialUsername?: string;
  initialPassword?: string;
  error?: string; // Optional error message to display
}

export function LoginForm({ onLoginSuccess, initialUsername = '', initialPassword = '', error }: LoginFormProps) {
  const queryClient = useQueryClient();
  const [username, setUsername] = React.useState(initialUsername);
  const [password, setPassword] = React.useState(initialPassword);

  React.useEffect(() => {
    // Load current values from localStorage or initial props when component mounts
    setUsername(initialUsername || localStorage.getItem('qbit_username') || 'admin');
    setPassword(initialPassword || localStorage.getItem('qbit_password') || 'adminadmin');
  }, [initialUsername, initialPassword]);


  const handleLogin = () => {
    // Save to localStorage
    localStorage.setItem('qbit_username', username);
    localStorage.setItem('qbit_password', password);
    // Base URL is now assumed to be window.location.origin or set via VITE_QBIT_BASE_URL

    // Invalidate login query to force re-login attempt with new credentials
    queryClient.invalidateQueries({ queryKey: ['login'] });
    
    // Call the success callback
    onLoginSuccess();
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl p-8">
        <h2 className="text-3xl font-bold text-center mb-6">Login to qBittorrent</h2>
        {error && (
          <p className="text-red-400 text-center mb-4">{error}</p>
        )}
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="login-username" className="text-right">
              Username
            </Label>
            <Input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="col-span-3"
              placeholder="admin"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="login-password" className="text-right">
              Password
            </Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="col-span-3"
              placeholder="adminadmin"
            />
          </div>
        </div>
        <Button className="w-full mt-6" onClick={handleLogin}>
          Login
        </Button>
      </div>
    </div>
  )
}
