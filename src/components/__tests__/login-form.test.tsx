import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginForm } from '../login-form'

/**
 * Helper to wrap component with QueryClientProvider
 * Required because LoginForm uses useQueryClient hook
 */
function renderLoginForm(props: React.ComponentProps<typeof LoginForm>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <LoginForm {...props} />
      </QueryClientProvider>,
    ),
  }
}

describe('LoginForm Component', () => {
  // Mock localStorage before each test
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()
    // Clear all mocks
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders login form with title', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      expect(screen.getByText('Login to qBittorrent')).toBeInTheDocument()
    })

    it('renders username and password fields', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      expect(screen.getByLabelText('Username')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
    })

    it('renders login button', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    })

    it('renders error message when error prop is provided', () => {
      const mockOnSuccess = vi.fn()
      const errorMessage = 'Invalid credentials'
      renderLoginForm({ onLoginSuccess: mockOnSuccess, error: errorMessage })

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
      expect(screen.getByText(errorMessage)).toHaveClass('text-red-400')
    })

    it('does not render error message when error prop is not provided', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const errorElements = document.querySelectorAll('.text-red-400')
      expect(errorElements.length).toBe(0)
    })
  })

  describe('Initial Values', () => {
    it('uses default values (admin/adminadmin) when no props or localStorage', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement

      expect(usernameInput.value).toBe('admin')
      expect(passwordInput.value).toBe('adminadmin')
    })

    it('uses initialUsername and initialPassword props when provided', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({
        onLoginSuccess: mockOnSuccess,
        initialUsername: 'testuser',
        initialPassword: 'testpass',
      })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement

      expect(usernameInput.value).toBe('testuser')
      expect(passwordInput.value).toBe('testpass')
    })

    it('loads values from localStorage when available', () => {
      localStorage.setItem('qbit_username', 'stored_user')
      localStorage.setItem('qbit_password', 'stored_pass')

      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement

      expect(usernameInput.value).toBe('stored_user')
      expect(passwordInput.value).toBe('stored_pass')
    })

    it('prioritizes initialUsername prop over localStorage', () => {
      localStorage.setItem('qbit_username', 'stored_user')
      localStorage.setItem('qbit_password', 'stored_pass')

      const mockOnSuccess = vi.fn()
      renderLoginForm({
        onLoginSuccess: mockOnSuccess,
        initialUsername: 'prop_user',
        initialPassword: 'prop_pass',
      })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement

      expect(usernameInput.value).toBe('prop_user')
      expect(passwordInput.value).toBe('prop_pass')
    })
  })

  describe('User Interactions', () => {
    it('allows user to type in username field', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement

      await user.clear(usernameInput)
      await user.type(usernameInput, 'newuser')

      expect(usernameInput.value).toBe('newuser')
    })

    it('allows user to type in password field', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement

      await user.clear(passwordInput)
      await user.type(passwordInput, 'newpassword')

      expect(passwordInput.value).toBe('newpassword')
    })

    it('password field has type="password"', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement
      expect(passwordInput.type).toBe('password')
    })

    it('allows user to modify both username and password', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement

      await user.clear(usernameInput)
      await user.type(usernameInput, 'customuser')
      await user.clear(passwordInput)
      await user.type(passwordInput, 'custompass')

      expect(usernameInput.value).toBe('customuser')
      expect(passwordInput.value).toBe('custompass')
    })
  })

  describe('Login Button Behavior', () => {
    it('calls onLoginSuccess when login button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const loginButton = screen.getByRole('button', { name: 'Login' })
      await user.click(loginButton)

      expect(mockOnSuccess).toHaveBeenCalledTimes(1)
    })

    it('saves username to localStorage when login button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({
        onLoginSuccess: mockOnSuccess,
        initialUsername: 'saveuser',
        initialPassword: 'savepass',
      })

      const loginButton = screen.getByRole('button', { name: 'Login' })
      await user.click(loginButton)

      expect(localStorage.getItem('qbit_username')).toBe('saveuser')
    })

    it('saves password to localStorage when login button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({
        onLoginSuccess: mockOnSuccess,
        initialUsername: 'saveuser',
        initialPassword: 'savepass',
      })

      const loginButton = screen.getByRole('button', { name: 'Login' })
      await user.click(loginButton)

      expect(localStorage.getItem('qbit_password')).toBe('savepass')
    })

    it('saves modified username and password to localStorage', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const usernameInput = screen.getByLabelText('Username')
      const passwordInput = screen.getByLabelText('Password')
      const loginButton = screen.getByRole('button', { name: 'Login' })

      await user.clear(usernameInput)
      await user.type(usernameInput, 'modifieduser')
      await user.clear(passwordInput)
      await user.type(passwordInput, 'modifiedpass')
      await user.click(loginButton)

      expect(localStorage.getItem('qbit_username')).toBe('modifieduser')
      expect(localStorage.getItem('qbit_password')).toBe('modifiedpass')
    })

    it('invalidates login query when login button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      const { queryClient } = renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // Spy on invalidateQueries method
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const loginButton = screen.getByRole('button', { name: 'Login' })
      await user.click(loginButton)

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['login'] })
    })
  })

  describe('Edge Cases', () => {
    it('handles empty username input', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const usernameInput = screen.getByLabelText('Username')
      const loginButton = screen.getByRole('button', { name: 'Login' })

      await user.clear(usernameInput)
      await user.click(loginButton)

      expect(localStorage.getItem('qbit_username')).toBe('')
      expect(mockOnSuccess).toHaveBeenCalledTimes(1)
    })

    it('handles empty password input', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const passwordInput = screen.getByLabelText('Password')
      const loginButton = screen.getByRole('button', { name: 'Login' })

      await user.clear(passwordInput)
      await user.click(loginButton)

      expect(localStorage.getItem('qbit_password')).toBe('')
      expect(mockOnSuccess).toHaveBeenCalledTimes(1)
    })

    it('handles special characters in username', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement
      const loginButton = screen.getByRole('button', { name: 'Login' })

      await user.clear(usernameInput)
      await user.type(usernameInput, 'user@example.com')
      await user.click(loginButton)

      expect(usernameInput.value).toBe('user@example.com')
      expect(localStorage.getItem('qbit_username')).toBe('user@example.com')
    })

    it('handles special characters in password', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const passwordInput = screen.getByLabelText(
        'Password',
      ) as HTMLInputElement
      const loginButton = screen.getByRole('button', { name: 'Login' })

      await user.clear(passwordInput)
      await user.type(passwordInput, 'p@ss!w0rd#123')
      await user.click(loginButton)

      expect(passwordInput.value).toBe('p@ss!w0rd#123')
      expect(localStorage.getItem('qbit_password')).toBe('p@ss!w0rd#123')
    })

    it('handles very long username', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const usernameInput = screen.getByLabelText(
        'Username',
      ) as HTMLInputElement
      const loginButton = screen.getByRole('button', { name: 'Login' })
      const longUsername = 'a'.repeat(100)

      await user.clear(usernameInput)
      await user.type(usernameInput, longUsername)
      await user.click(loginButton)

      expect(usernameInput.value).toBe(longUsername)
      expect(localStorage.getItem('qbit_username')).toBe(longUsername)
    })

    it('handles multiple login button clicks', async () => {
      const user = userEvent.setup()
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const loginButton = screen.getByRole('button', { name: 'Login' })

      await user.click(loginButton)
      await user.click(loginButton)
      await user.click(loginButton)

      expect(mockOnSuccess).toHaveBeenCalledTimes(3)
    })
  })

  describe('Props Updates', () => {
    it('updates username when initialUsername prop changes', () => {
      const mockOnSuccess = vi.fn()
      const { rerender } = render(
        <QueryClientProvider client={new QueryClient()}>
          <LoginForm
            onLoginSuccess={mockOnSuccess}
            initialUsername="user1"
            initialPassword="pass1"
          />
        </QueryClientProvider>,
      )

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      let usernameInput = screen.getByLabelText('Username') as HTMLInputElement
      expect(usernameInput.value).toBe('user1')

      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <LoginForm
            onLoginSuccess={mockOnSuccess}
            initialUsername="user2"
            initialPassword="pass1"
          />
        </QueryClientProvider>,
      )

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      usernameInput = screen.getByLabelText('Username') as HTMLInputElement
      expect(usernameInput.value).toBe('user2')
    })

    it('updates password when initialPassword prop changes', () => {
      const mockOnSuccess = vi.fn()
      const { rerender } = render(
        <QueryClientProvider client={new QueryClient()}>
          <LoginForm
            onLoginSuccess={mockOnSuccess}
            initialUsername="user1"
            initialPassword="pass1"
          />
        </QueryClientProvider>,
      )

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      let passwordInput = screen.getByLabelText('Password') as HTMLInputElement
      expect(passwordInput.value).toBe('pass1')

      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <LoginForm
            onLoginSuccess={mockOnSuccess}
            initialUsername="user1"
            initialPassword="pass2"
          />
        </QueryClientProvider>,
      )

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      passwordInput = screen.getByLabelText('Password') as HTMLInputElement
      expect(passwordInput.value).toBe('pass2')
    })
  })

  describe('Accessibility', () => {
    it('associates username label with input', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const usernameInput = screen.getByLabelText('Username')
      expect(usernameInput).toHaveAttribute('id', 'login-username')
    })

    it('associates password label with input', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const passwordInput = screen.getByLabelText('Password')
      expect(passwordInput).toHaveAttribute('id', 'login-password')
    })

    it('has placeholder text for username', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const usernameInput = screen.getByLabelText('Username')
      expect(usernameInput).toHaveAttribute('placeholder', 'admin')
    })

    it('has placeholder text for password', () => {
      const mockOnSuccess = vi.fn()
      renderLoginForm({ onLoginSuccess: mockOnSuccess })

      const passwordInput = screen.getByLabelText('Password')
      expect(passwordInput).toHaveAttribute('placeholder', 'adminadmin')
    })
  })
})
