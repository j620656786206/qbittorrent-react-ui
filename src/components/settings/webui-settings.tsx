import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react'
import type {
  AppPreferences,
  AppPreferencesPayload,
  DynDnsService,
} from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'
import { DynDnsServiceLabels } from '@/types/preferences'

/**
 * Form data type for WebUI settings
 * Based on AppPreferences fields related to WebUI configuration
 */
type WebUIFormData = {
  // Interface
  web_ui_address: string
  web_ui_port: number
  web_ui_upnp: boolean
  alternative_webui_enabled: boolean
  alternative_webui_path: string

  // Authentication
  web_ui_username: string
  web_ui_password: string
  bypass_local_auth: boolean
  bypass_auth_subnet_whitelist_enabled: boolean
  bypass_auth_subnet_whitelist: string
  web_ui_max_auth_fail_count: number
  web_ui_ban_duration: number
  web_ui_session_timeout: number

  // HTTPS
  use_https: boolean
  web_ui_https_cert_path: string
  web_ui_https_key_path: string

  // Security
  web_ui_clickjacking_protection_enabled: boolean
  web_ui_csrf_protection_enabled: boolean
  web_ui_secure_cookie_enabled: boolean
  web_ui_host_header_validation_enabled: boolean
  web_ui_domain_list: string
  web_ui_use_custom_http_headers_enabled: boolean
  web_ui_custom_http_headers: string

  // DDNS
  dyndns_enabled: boolean
  dyndns_service: number
  dyndns_domain: string
  dyndns_username: string
  dyndns_password: string
}

interface WebUISettingsProps {
  preferences: AppPreferences
}

/**
 * Collapsible section component for grouping related settings
 */
function SettingsSection({
  title,
  description,
  children,
  defaultOpen = true,
  warning,
}: {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
  warning?: string
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div>
          <h3 className="font-medium">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          {warning && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * WebUI settings form component
 * Handles ~25 parameters for WebUI security and configuration
 */
export function WebUISettings({ preferences }: WebUISettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()
  const [showPassword, setShowPassword] = React.useState(false)
  const [showDynDnsPassword, setShowDynDnsPassword] = React.useState(false)

  // Initialize form with current preferences
  const {
    control,
    handleSubmit,
    watch,
    formState: { isDirty, isSubmitting },
  } = useForm<WebUIFormData>({
    defaultValues: {
      // Interface
      web_ui_address: preferences.web_ui_address,
      web_ui_port: preferences.web_ui_port,
      web_ui_upnp: preferences.web_ui_upnp,
      alternative_webui_enabled: preferences.alternative_webui_enabled,
      alternative_webui_path: preferences.alternative_webui_path,

      // Authentication
      web_ui_username: preferences.web_ui_username,
      web_ui_password: '', // Write-only field, don't populate
      bypass_local_auth: preferences.bypass_local_auth,
      bypass_auth_subnet_whitelist_enabled:
        preferences.bypass_auth_subnet_whitelist_enabled,
      bypass_auth_subnet_whitelist: preferences.bypass_auth_subnet_whitelist,
      web_ui_max_auth_fail_count: preferences.web_ui_max_auth_fail_count,
      web_ui_ban_duration: preferences.web_ui_ban_duration,
      web_ui_session_timeout: preferences.web_ui_session_timeout,

      // HTTPS
      use_https: preferences.use_https,
      web_ui_https_cert_path: preferences.web_ui_https_cert_path,
      web_ui_https_key_path: preferences.web_ui_https_key_path,

      // Security
      web_ui_clickjacking_protection_enabled:
        preferences.web_ui_clickjacking_protection_enabled,
      web_ui_csrf_protection_enabled:
        preferences.web_ui_csrf_protection_enabled,
      web_ui_secure_cookie_enabled: preferences.web_ui_secure_cookie_enabled,
      web_ui_host_header_validation_enabled:
        preferences.web_ui_host_header_validation_enabled,
      web_ui_domain_list: preferences.web_ui_domain_list,
      web_ui_use_custom_http_headers_enabled:
        preferences.web_ui_use_custom_http_headers_enabled,
      web_ui_custom_http_headers: preferences.web_ui_custom_http_headers,

      // DDNS
      dyndns_enabled: preferences.dyndns_enabled,
      dyndns_service: preferences.dyndns_service,
      dyndns_domain: preferences.dyndns_domain,
      dyndns_username: preferences.dyndns_username,
      dyndns_password: '', // Write-only field, don't populate
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Watch values for conditional rendering
  const useHttps = watch('use_https')
  const bypassAuthSubnetWhitelistEnabled = watch(
    'bypass_auth_subnet_whitelist_enabled',
  )
  const alternativeWebuiEnabled = watch('alternative_webui_enabled')
  const hostHeaderValidationEnabled = watch(
    'web_ui_host_header_validation_enabled',
  )
  const customHttpHeadersEnabled = watch(
    'web_ui_use_custom_http_headers_enabled',
  )
  const dyndnsEnabled = watch('dyndns_enabled')

  // Handle form submission
  const onSubmit = (data: WebUIFormData) => {
    const payload: AppPreferencesPayload = {
      // Interface
      web_ui_address: data.web_ui_address,
      web_ui_port: data.web_ui_port,
      web_ui_upnp: data.web_ui_upnp,
      alternative_webui_enabled: data.alternative_webui_enabled,
      alternative_webui_path: data.alternative_webui_path,

      // Authentication
      web_ui_username: data.web_ui_username,
      bypass_local_auth: data.bypass_local_auth,
      bypass_auth_subnet_whitelist_enabled:
        data.bypass_auth_subnet_whitelist_enabled,
      bypass_auth_subnet_whitelist: data.bypass_auth_subnet_whitelist,
      web_ui_max_auth_fail_count: data.web_ui_max_auth_fail_count,
      web_ui_ban_duration: data.web_ui_ban_duration,
      web_ui_session_timeout: data.web_ui_session_timeout,

      // HTTPS
      use_https: data.use_https,
      web_ui_https_cert_path: data.web_ui_https_cert_path,
      web_ui_https_key_path: data.web_ui_https_key_path,

      // Security
      web_ui_clickjacking_protection_enabled:
        data.web_ui_clickjacking_protection_enabled,
      web_ui_csrf_protection_enabled: data.web_ui_csrf_protection_enabled,
      web_ui_secure_cookie_enabled: data.web_ui_secure_cookie_enabled,
      web_ui_host_header_validation_enabled:
        data.web_ui_host_header_validation_enabled,
      web_ui_domain_list: data.web_ui_domain_list,
      web_ui_use_custom_http_headers_enabled:
        data.web_ui_use_custom_http_headers_enabled,
      web_ui_custom_http_headers: data.web_ui_custom_http_headers,

      // DDNS
      dyndns_enabled: data.dyndns_enabled,
      dyndns_service: data.dyndns_service as DynDnsService,
      dyndns_domain: data.dyndns_domain,
      dyndns_username: data.dyndns_username,
    }

    // Only include password if it was changed
    if (data.web_ui_password) {
      payload.web_ui_password = data.web_ui_password
    }

    // Only include DDNS password if it was changed
    if (data.dyndns_password) {
      payload.dyndns_password = data.dyndns_password
    }

    updatePreferences.mutate(payload)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* WebUI Interface Section */}
      <SettingsSection
        title={t('qbittorrent.webui.interface.title', 'Web User Interface')}
        description={t(
          'qbittorrent.webui.interface.description',
          'Configure WebUI address and port settings',
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* IP Address */}
          <div className="grid gap-2">
            <Label htmlFor="web_ui_address">
              {t('qbittorrent.webui.ipAddress', 'IP Address')}
            </Label>
            <Controller
              name="web_ui_address"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="web_ui_address"
                  placeholder={t(
                    'qbittorrent.webui.allInterfaces',
                    '* (All interfaces)',
                  )}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'qbittorrent.webui.ipAddressHint',
                'Leave empty or use * to listen on all interfaces',
              )}
            </p>
          </div>

          {/* Port */}
          <div className="grid gap-2">
            <Label htmlFor="web_ui_port">
              {t('qbittorrent.webui.port', 'Port')}
            </Label>
            <Controller
              name="web_ui_port"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="web_ui_port"
                  type="number"
                  min={1}
                  max={65535}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 8080)
                  }
                />
              )}
            />
          </div>
        </div>

        {/* UPnP */}
        <Controller
          name="web_ui_upnp"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="web_ui_upnp"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="web_ui_upnp"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.webui.upnp',
                  'Use UPnP / NAT-PMP to forward the port from my router',
                )}
              </Label>
            </div>
          )}
        />

        {/* Alternative WebUI */}
        <Controller
          name="alternative_webui_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="alternative_webui_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="alternative_webui_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.webui.alternativeWebui',
                  'Use alternative WebUI',
                )}
              </Label>
            </div>
          )}
        />

        {alternativeWebuiEnabled && (
          <div className="ml-6">
            <div className="grid gap-2">
              <Label htmlFor="alternative_webui_path">
                {t('qbittorrent.webui.alternativeWebuiPath', 'Files location')}
              </Label>
              <Controller
                name="alternative_webui_path"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="alternative_webui_path"
                    placeholder="/path/to/alternative/webui"
                    className="font-mono text-sm"
                  />
                )}
              />
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Authentication Section */}
      <SettingsSection
        title={t('qbittorrent.webui.authentication.title', 'Authentication')}
        description={t(
          'qbittorrent.webui.authentication.description',
          'Configure login credentials and session settings',
        )}
        warning={t(
          'qbittorrent.webui.authentication.warning',
          'Changing authentication settings may require you to log in again',
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Username */}
          <div className="grid gap-2">
            <Label htmlFor="web_ui_username">
              {t('qbittorrent.webui.username', 'Username')}
            </Label>
            <Controller
              name="web_ui_username"
              control={control}
              render={({ field }) => <Input {...field} id="web_ui_username" />}
            />
          </div>

          {/* Password */}
          <div className="grid gap-2">
            <Label htmlFor="web_ui_password">
              {t('qbittorrent.webui.password', 'Password')}
            </Label>
            <div className="relative">
              <Controller
                name="web_ui_password"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="web_ui_password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t(
                      'qbittorrent.webui.passwordPlaceholder',
                      'Enter to change',
                    )}
                    className="pr-10"
                  />
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={t(
                  showPassword ? 'common.hidePassword' : 'common.showPassword',
                )}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Bypass Local Auth */}
        <Controller
          name="bypass_local_auth"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="bypass_local_auth"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="bypass_local_auth"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.webui.bypassLocalAuth',
                  'Bypass authentication for clients on localhost',
                )}
              </Label>
            </div>
          )}
        />

        {/* Bypass Auth Subnet Whitelist */}
        <Controller
          name="bypass_auth_subnet_whitelist_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="bypass_auth_subnet_whitelist_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="bypass_auth_subnet_whitelist_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.webui.bypassAuthSubnet',
                  'Bypass authentication for clients in whitelisted IP subnets',
                )}
              </Label>
            </div>
          )}
        />

        {bypassAuthSubnetWhitelistEnabled && (
          <div className="ml-6">
            <div className="grid gap-2">
              <Label htmlFor="bypass_auth_subnet_whitelist">
                {t('qbittorrent.webui.subnetWhitelist', 'IP subnet whitelist')}
              </Label>
              <Controller
                name="bypass_auth_subnet_whitelist"
                control={control}
                render={({ field }) => (
                  <Textarea
                    {...field}
                    id="bypass_auth_subnet_whitelist"
                    placeholder={'192.168.1.0/24\n10.0.0.0/8'}
                    rows={3}
                    className="font-mono text-sm"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'qbittorrent.webui.subnetWhitelistHint',
                  'Enter one CIDR subnet per line',
                )}
              </p>
            </div>
          </div>
        )}

        {/* Session Settings */}
        <div className="grid gap-4 sm:grid-cols-3 pt-2">
          <div className="grid gap-2">
            <Label htmlFor="web_ui_max_auth_fail_count">
              {t('qbittorrent.webui.maxAuthFailCount', 'Max auth failures')}
            </Label>
            <Controller
              name="web_ui_max_auth_fail_count"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="web_ui_max_auth_fail_count"
                  type="number"
                  min={1}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 5)
                  }
                />
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="web_ui_ban_duration">
              {t('qbittorrent.webui.banDuration', 'Ban duration (s)')}
            </Label>
            <Controller
              name="web_ui_ban_duration"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="web_ui_ban_duration"
                  type="number"
                  min={0}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 0)
                  }
                />
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="web_ui_session_timeout">
              {t('qbittorrent.webui.sessionTimeout', 'Session timeout (s)')}
            </Label>
            <Controller
              name="web_ui_session_timeout"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="web_ui_session_timeout"
                  type="number"
                  min={0}
                  onChange={(e) =>
                    field.onChange(parseInt(e.target.value, 10) || 0)
                  }
                />
              )}
            />
          </div>
        </div>
      </SettingsSection>

      {/* HTTPS Section */}
      <SettingsSection
        title={t('qbittorrent.webui.https.title', 'HTTPS')}
        description={t(
          'qbittorrent.webui.https.description',
          'Enable secure HTTPS connections',
        )}
      >
        <Controller
          name="use_https"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="use_https"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="use_https" className="font-normal cursor-pointer">
                {t('qbittorrent.webui.enableHttps', 'Enable HTTPS')}
              </Label>
            </div>
          )}
        />

        {useHttps && (
          <div className="space-y-4 ml-6">
            <div className="grid gap-2">
              <Label htmlFor="web_ui_https_cert_path">
                {t('qbittorrent.webui.certPath', 'Certificate file path')}
              </Label>
              <Controller
                name="web_ui_https_cert_path"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="web_ui_https_cert_path"
                    placeholder="/path/to/certificate.crt"
                    className="font-mono text-sm"
                  />
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="web_ui_https_key_path">
                {t('qbittorrent.webui.keyPath', 'Private key file path')}
              </Label>
              <Controller
                name="web_ui_https_key_path"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="web_ui_https_key_path"
                    placeholder="/path/to/private.key"
                    className="font-mono text-sm"
                  />
                )}
              />
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Security Section */}
      <SettingsSection
        title={t('qbittorrent.webui.security.title', 'Security')}
        description={t(
          'qbittorrent.webui.security.description',
          'Configure web security protections',
        )}
        warning={t(
          'qbittorrent.webui.security.warning',
          'Disabling security protections may expose your qBittorrent to attacks',
        )}
      >
        <div className="space-y-3">
          <Controller
            name="web_ui_clickjacking_protection_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="web_ui_clickjacking_protection_enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="web_ui_clickjacking_protection_enabled"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.webui.clickjackingProtection',
                    'Enable clickjacking protection',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="web_ui_csrf_protection_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="web_ui_csrf_protection_enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="web_ui_csrf_protection_enabled"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.webui.csrfProtection',
                    'Enable Cross-Site Request Forgery (CSRF) protection',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="web_ui_secure_cookie_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="web_ui_secure_cookie_enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="web_ui_secure_cookie_enabled"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.webui.secureCookie',
                    'Enable secure cookie flag (requires HTTPS)',
                  )}
                </Label>
              </div>
            )}
          />

          <Controller
            name="web_ui_host_header_validation_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="web_ui_host_header_validation_enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="web_ui_host_header_validation_enabled"
                  className="font-normal cursor-pointer"
                >
                  {t(
                    'qbittorrent.webui.hostHeaderValidation',
                    'Enable Host header validation',
                  )}
                </Label>
              </div>
            )}
          />
        </div>

        {/* Domain List (shown when host header validation is enabled) */}
        {hostHeaderValidationEnabled && (
          <div className="grid gap-2 ml-6">
            <Label htmlFor="web_ui_domain_list">
              {t('qbittorrent.webui.domainList', 'Server domains')}
            </Label>
            <Controller
              name="web_ui_domain_list"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="web_ui_domain_list"
                  placeholder="example.com, localhost"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'qbittorrent.webui.domainListHint',
                'Comma-separated list of allowed domains. Use * to allow all.',
              )}
            </p>
          </div>
        )}

        {/* Custom HTTP Headers */}
        <Controller
          name="web_ui_use_custom_http_headers_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="web_ui_use_custom_http_headers_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="web_ui_use_custom_http_headers_enabled"
                className="font-normal cursor-pointer"
              >
                {t(
                  'qbittorrent.webui.customHttpHeaders',
                  'Add custom HTTP headers',
                )}
              </Label>
            </div>
          )}
        />

        {customHttpHeadersEnabled && (
          <div className="grid gap-2 ml-6">
            <Label htmlFor="web_ui_custom_http_headers">
              {t('qbittorrent.webui.customHeaders', 'Custom headers')}
            </Label>
            <Controller
              name="web_ui_custom_http_headers"
              control={control}
              render={({ field }) => (
                <Textarea
                  {...field}
                  id="web_ui_custom_http_headers"
                  placeholder={
                    'X-Frame-Options: SAMEORIGIN\nX-Content-Type-Options: nosniff'
                  }
                  rows={4}
                  className="font-mono text-sm"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'qbittorrent.webui.customHeadersHint',
                'One header per line, format: Header-Name: Value',
              )}
            </p>
          </div>
        )}
      </SettingsSection>

      {/* Dynamic DNS Section */}
      <SettingsSection
        title={t('qbittorrent.webui.ddns.title', 'Dynamic DNS')}
        description={t(
          'qbittorrent.webui.ddns.description',
          'Update dynamic DNS with your current IP',
        )}
        defaultOpen={false}
      >
        <Controller
          name="dyndns_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="dyndns_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="dyndns_enabled"
                className="font-normal cursor-pointer"
              >
                {t('qbittorrent.webui.enableDdns', 'Enable dynamic DNS')}
              </Label>
            </div>
          )}
        />

        {dyndnsEnabled && (
          <div className="space-y-4 ml-6">
            {/* Service */}
            <div className="grid gap-2">
              <Label htmlFor="dyndns_service">
                {t('qbittorrent.webui.ddnsService', 'Service')}
              </Label>
              <Controller
                name="dyndns_service"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    id="dyndns_service"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10))
                    }
                    className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                  >
                    {Object.entries(DynDnsServiceLabels).map(
                      ([value, labelKey]) => (
                        <option key={value} value={value}>
                          {t(labelKey, value === '0' ? 'DynDNS' : 'NO-IP')}
                        </option>
                      ),
                    )}
                  </select>
                )}
              />
            </div>

            {/* Domain */}
            <div className="grid gap-2">
              <Label htmlFor="dyndns_domain">
                {t('qbittorrent.webui.ddnsDomain', 'Domain name')}
              </Label>
              <Controller
                name="dyndns_domain"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="dyndns_domain"
                    placeholder="yourdomain.dyndns.org"
                  />
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Username */}
              <div className="grid gap-2">
                <Label htmlFor="dyndns_username">
                  {t('qbittorrent.webui.ddnsUsername', 'Username')}
                </Label>
                <Controller
                  name="dyndns_username"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} id="dyndns_username" />
                  )}
                />
              </div>

              {/* Password */}
              <div className="grid gap-2">
                <Label htmlFor="dyndns_password">
                  {t('qbittorrent.webui.ddnsPassword', 'Password')}
                </Label>
                <div className="relative">
                  <Controller
                    name="dyndns_password"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="dyndns_password"
                        type={showDynDnsPassword ? 'text' : 'password'}
                        placeholder={t(
                          'qbittorrent.webui.passwordPlaceholder',
                          'Enter to change',
                        )}
                        className="pr-10"
                      />
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowDynDnsPassword(!showDynDnsPassword)}
                    aria-label={t(
                      showDynDnsPassword
                        ? 'common.hidePassword'
                        : 'common.showPassword',
                    )}
                  >
                    {showDynDnsPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting || updatePreferences.isPending}
        >
          {(isSubmitting || updatePreferences.isPending) && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {t('common.save', 'Save')}
        </Button>
      </div>

      {/* Error Display */}
      {updatePreferences.isError && (
        <div className="text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">
          {updatePreferences.error instanceof Error
            ? updatePreferences.error.message
            : t(
                'qbittorrent.webui.saveFailed',
                'Failed to save WebUI settings',
              )}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t(
            'qbittorrent.webui.saveSuccess',
            'WebUI settings saved successfully',
          )}
        </div>
      )}
    </form>
  )
}

/**
 * WebUI settings tab wrapper that handles loading state
 */
export function WebUISettingsTab() {
  const { data: preferences, isLoading, error } = usePreferences()
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !preferences) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-destructive">
          {t('qbittorrent.webui.errorLoading', 'Failed to load WebUI settings')}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <WebUISettings preferences={preferences} />
}
