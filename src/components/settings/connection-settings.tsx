import React from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm } from 'react-hook-form'
import { ChevronDown, ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import type { AppPreferences, AppPreferencesPayload } from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences, useUpdatePreferences } from '@/hooks/use-preferences'
import { ProxyType, ProxyTypeLabels } from '@/types/preferences'

/**
 * Form data type for Connection settings
 * Based on AppPreferences fields related to connection configuration
 */
type ConnectionFormData = {
  // Listening Port
  listen_port: number
  upnp: boolean

  // Connection Limits
  max_connec: number
  max_connec_per_torrent: number
  max_uploads: number
  max_uploads_per_torrent: number

  // Proxy Settings
  proxy_type: string
  proxy_ip: string
  proxy_port: number
  proxy_auth_enabled: boolean
  proxy_username: string
  proxy_password: string
  proxy_peer_connections: boolean
  proxy_hostname_lookup: boolean
  proxy_bittorrent: boolean
  proxy_rss: boolean
  proxy_misc: boolean

  // IP Filtering
  ip_filter_enabled: boolean
  ip_filter_path: string
  ip_filter_trackers: boolean
  banned_IPs: string

  // I2P Settings (qBit 5.0+)
  i2p_enabled: boolean
  i2p_address: string
  i2p_port: number
  i2p_mixed_mode: boolean
  i2p_inbound_quantity: number
  i2p_outbound_quantity: number
  i2p_inbound_length: number
  i2p_outbound_length: number
}

interface ConnectionSettingsProps {
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
}: {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
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
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  )
}

/**
 * Connection settings form component
 * Handles ~30 parameters for connection configuration
 */
export function ConnectionSettings({ preferences }: ConnectionSettingsProps) {
  const { t } = useTranslation()
  const updatePreferences = useUpdatePreferences()
  const [showProxyPassword, setShowProxyPassword] = React.useState(false)

  // Initialize form with current preferences
  const { control, handleSubmit, watch, formState: { isDirty, isSubmitting } } = useForm<ConnectionFormData>({
    defaultValues: {
      // Listening Port
      listen_port: preferences.listen_port,
      upnp: preferences.upnp,

      // Connection Limits
      max_connec: preferences.max_connec,
      max_connec_per_torrent: preferences.max_connec_per_torrent,
      max_uploads: preferences.max_uploads,
      max_uploads_per_torrent: preferences.max_uploads_per_torrent,

      // Proxy Settings
      proxy_type: preferences.proxy_type,
      proxy_ip: preferences.proxy_ip,
      proxy_port: preferences.proxy_port,
      proxy_auth_enabled: preferences.proxy_auth_enabled,
      proxy_username: preferences.proxy_username,
      proxy_password: '', // Write-only field, don't populate
      proxy_peer_connections: preferences.proxy_peer_connections,
      proxy_hostname_lookup: preferences.proxy_hostname_lookup,
      proxy_bittorrent: preferences.proxy_bittorrent,
      proxy_rss: preferences.proxy_rss,
      proxy_misc: preferences.proxy_misc,

      // IP Filtering
      ip_filter_enabled: preferences.ip_filter_enabled,
      ip_filter_path: preferences.ip_filter_path,
      ip_filter_trackers: preferences.ip_filter_trackers,
      banned_IPs: preferences.banned_IPs,

      // I2P Settings (qBit 5.0+)
      i2p_enabled: preferences.i2p_enabled,
      i2p_address: preferences.i2p_address,
      i2p_port: preferences.i2p_port,
      i2p_mixed_mode: preferences.i2p_mixed_mode,
      i2p_inbound_quantity: preferences.i2p_inbound_quantity,
      i2p_outbound_quantity: preferences.i2p_outbound_quantity,
      i2p_inbound_length: preferences.i2p_inbound_length,
      i2p_outbound_length: preferences.i2p_outbound_length,
    },
    mode: 'onBlur', // Performance optimization for large forms
  })

  // Watch values for conditional rendering
  const proxyType = watch('proxy_type')
  const proxyAuthEnabled = watch('proxy_auth_enabled')
  const ipFilterEnabled = watch('ip_filter_enabled')
  const i2pEnabled = watch('i2p_enabled')

  const proxyEnabled = proxyType !== ProxyType.NONE && proxyType !== 'None'

  // Handle form submission
  const onSubmit = (data: ConnectionFormData) => {
    const payload: AppPreferencesPayload = {
      // Listening Port
      listen_port: data.listen_port,
      upnp: data.upnp,

      // Connection Limits
      max_connec: data.max_connec,
      max_connec_per_torrent: data.max_connec_per_torrent,
      max_uploads: data.max_uploads,
      max_uploads_per_torrent: data.max_uploads_per_torrent,

      // Proxy Settings
      proxy_type: data.proxy_type as ProxyType,
      proxy_ip: data.proxy_ip,
      proxy_port: data.proxy_port,
      proxy_auth_enabled: data.proxy_auth_enabled,
      proxy_username: data.proxy_username,
      proxy_peer_connections: data.proxy_peer_connections,
      proxy_hostname_lookup: data.proxy_hostname_lookup,
      proxy_bittorrent: data.proxy_bittorrent,
      proxy_rss: data.proxy_rss,
      proxy_misc: data.proxy_misc,

      // IP Filtering
      ip_filter_enabled: data.ip_filter_enabled,
      ip_filter_path: data.ip_filter_path,
      ip_filter_trackers: data.ip_filter_trackers,
      banned_IPs: data.banned_IPs,

      // I2P Settings (only include if they exist in preferences)
      ...(preferences.i2p_enabled !== undefined && {
        i2p_enabled: data.i2p_enabled,
        i2p_address: data.i2p_address,
        i2p_port: data.i2p_port,
        i2p_mixed_mode: data.i2p_mixed_mode,
        i2p_inbound_quantity: data.i2p_inbound_quantity,
        i2p_outbound_quantity: data.i2p_outbound_quantity,
        i2p_inbound_length: data.i2p_inbound_length,
        i2p_outbound_length: data.i2p_outbound_length,
      }),
    }

    // Only include password if it was changed
    if (data.proxy_password) {
      payload.proxy_password = data.proxy_password
    }

    updatePreferences.mutate(payload)
  }

  // Check if I2P settings are available (qBit 5.0+)
  const hasI2pSupport = preferences.i2p_enabled !== undefined

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Listening Port Section */}
      <SettingsSection
        title={t('qbittorrent.connection.listeningPort.title', 'Listening Port')}
        description={t('qbittorrent.connection.listeningPort.description', 'Configure port for incoming connections')}
      >
        {/* Port Number */}
        <div className="grid gap-2">
          <Label htmlFor="listen_port">
            {t('qbittorrent.connection.port', 'Port used for incoming connections')}
          </Label>
          <div className="flex items-center gap-2">
            <Controller
              name="listen_port"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="listen_port"
                  type="number"
                  min={1}
                  max={65535}
                  className="max-w-[200px]"
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {t('qbittorrent.connection.portRange', '(1-65535)')}
            </span>
          </div>
        </div>

        {/* UPnP */}
        <Controller
          name="upnp"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="upnp"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="upnp" className="font-normal cursor-pointer">
                {t('qbittorrent.connection.upnp', 'Use UPnP / NAT-PMP port forwarding from my router')}
              </Label>
            </div>
          )}
        />
      </SettingsSection>

      {/* Connection Limits Section */}
      <SettingsSection
        title={t('qbittorrent.connection.connectionLimits.title', 'Connection Limits')}
        description={t('qbittorrent.connection.connectionLimits.description', 'Set maximum number of connections')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Global Max Connections */}
          <div className="grid gap-2">
            <Label htmlFor="max_connec">
              {t('qbittorrent.connection.globalMaxConnections', 'Global maximum connections')}
            </Label>
            <Controller
              name="max_connec"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="max_connec"
                  type="number"
                  min={-1}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                />
              )}
            />
          </div>

          {/* Max Connections Per Torrent */}
          <div className="grid gap-2">
            <Label htmlFor="max_connec_per_torrent">
              {t('qbittorrent.connection.maxConnectionsPerTorrent', 'Maximum connections per torrent')}
            </Label>
            <Controller
              name="max_connec_per_torrent"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="max_connec_per_torrent"
                  type="number"
                  min={-1}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                />
              )}
            />
          </div>

          {/* Global Max Uploads */}
          <div className="grid gap-2">
            <Label htmlFor="max_uploads">
              {t('qbittorrent.connection.globalMaxUploadSlots', 'Global maximum upload slots')}
            </Label>
            <Controller
              name="max_uploads"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="max_uploads"
                  type="number"
                  min={-1}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                />
              )}
            />
          </div>

          {/* Max Uploads Per Torrent */}
          <div className="grid gap-2">
            <Label htmlFor="max_uploads_per_torrent">
              {t('qbittorrent.connection.maxUploadSlotsPerTorrent', 'Maximum upload slots per torrent')}
            </Label>
            <Controller
              name="max_uploads_per_torrent"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="max_uploads_per_torrent"
                  type="number"
                  min={-1}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                />
              )}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('qbittorrent.connection.unlimitedHint', '-1 = unlimited, 0 = disabled')}
        </p>
      </SettingsSection>

      {/* Proxy Server Section */}
      <SettingsSection
        title={t('qbittorrent.connection.proxy.title', 'Proxy Server')}
        description={t('qbittorrent.connection.proxy.description', 'Configure proxy settings for connections')}
      >
        {/* Proxy Type */}
        <div className="grid gap-2">
          <Label htmlFor="proxy_type">
            {t('qbittorrent.connection.proxyType', 'Type')}
          </Label>
          <Controller
            name="proxy_type"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                id="proxy_type"
                className="h-9 w-full max-w-[300px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
              >
                {Object.entries(ProxyTypeLabels).map(([value, labelKey]) => (
                  <option key={value} value={value}>
                    {t(labelKey, value)}
                  </option>
                ))}
              </select>
            )}
          />
        </div>

        {/* Proxy Address and Port (conditional) */}
        {proxyEnabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="proxy_ip">
                  {t('qbittorrent.connection.proxyHost', 'Host')}
                </Label>
                <Controller
                  name="proxy_ip"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="proxy_ip"
                      placeholder="proxy.example.com"
                    />
                  )}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="proxy_port">
                  {t('qbittorrent.connection.proxyPort', 'Port')}
                </Label>
                <Controller
                  name="proxy_port"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="proxy_port"
                      type="number"
                      min={1}
                      max={65535}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  )}
                />
              </div>
            </div>

            {/* Proxy Authentication */}
            <Controller
              name="proxy_auth_enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="proxy_auth_enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="proxy_auth_enabled" className="font-normal cursor-pointer">
                    {t('qbittorrent.connection.proxyAuth', 'Proxy requires authentication')}
                  </Label>
                </div>
              )}
            />

            {/* Proxy Credentials (conditional) */}
            {proxyAuthEnabled && (
              <div className="space-y-4 ml-6 p-3 bg-muted/30 rounded-md">
                <div className="grid gap-2">
                  <Label htmlFor="proxy_username">
                    {t('qbittorrent.connection.proxyUsername', 'Username')}
                  </Label>
                  <Controller
                    name="proxy_username"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="proxy_username"
                        className="max-w-[300px]"
                      />
                    )}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="proxy_password">
                    {t('qbittorrent.connection.proxyPassword', 'Password')}
                  </Label>
                  <div className="relative max-w-[300px]">
                    <Controller
                      name="proxy_password"
                      control={control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          id="proxy_password"
                          type={showProxyPassword ? 'text' : 'password'}
                          placeholder={t('qbittorrent.connection.passwordPlaceholder', 'Enter to change')}
                          className="pr-10"
                        />
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowProxyPassword(!showProxyPassword)}
                      aria-label={t(showProxyPassword ? 'common.hidePassword' : 'common.showPassword')}
                    >
                      {showProxyPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Proxy Usage Options */}
            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium">
                {t('qbittorrent.connection.proxyUseFor', 'Use proxy for:')}
              </p>

              <Controller
                name="proxy_peer_connections"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="proxy_peer_connections"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="proxy_peer_connections" className="font-normal cursor-pointer">
                      {t('qbittorrent.connection.proxyPeerConnections', 'Peer connections')}
                    </Label>
                  </div>
                )}
              />

              <Controller
                name="proxy_hostname_lookup"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="proxy_hostname_lookup"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="proxy_hostname_lookup" className="font-normal cursor-pointer">
                      {t('qbittorrent.connection.proxyHostnameLookup', 'Hostname lookups')}
                    </Label>
                  </div>
                )}
              />

              <Controller
                name="proxy_bittorrent"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="proxy_bittorrent"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="proxy_bittorrent" className="font-normal cursor-pointer">
                      {t('qbittorrent.connection.proxyBittorrent', 'BitTorrent connections')}
                    </Label>
                  </div>
                )}
              />

              <Controller
                name="proxy_rss"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="proxy_rss"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="proxy_rss" className="font-normal cursor-pointer">
                      {t('qbittorrent.connection.proxyRss', 'RSS feeds')}
                    </Label>
                  </div>
                )}
              />

              <Controller
                name="proxy_misc"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="proxy_misc"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="proxy_misc" className="font-normal cursor-pointer">
                      {t('qbittorrent.connection.proxyMisc', 'Miscellaneous (GeoIP, search engines, etc.)')}
                    </Label>
                  </div>
                )}
              />
            </div>
          </>
        )}
      </SettingsSection>

      {/* IP Filtering Section */}
      <SettingsSection
        title={t('qbittorrent.connection.ipFiltering.title', 'IP Filtering')}
        description={t('qbittorrent.connection.ipFiltering.description', 'Block connections from specific IP addresses')}
        defaultOpen={false}
      >
        <Controller
          name="ip_filter_enabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id="ip_filter_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="ip_filter_enabled" className="font-normal cursor-pointer">
                {t('qbittorrent.connection.enableIpFiltering', 'Enable IP filtering')}
              </Label>
            </div>
          )}
        />

        {ipFilterEnabled && (
          <div className="space-y-4 ml-6">
            <div className="grid gap-2">
              <Label htmlFor="ip_filter_path">
                {t('qbittorrent.connection.ipFilterPath', 'Filter path (.dat, .p2p, .p2b)')}
              </Label>
              <Controller
                name="ip_filter_path"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="ip_filter_path"
                    placeholder="/path/to/ipfilter.dat"
                    className="font-mono text-sm"
                  />
                )}
              />
            </div>

            <Controller
              name="ip_filter_trackers"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ip_filter_trackers"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="ip_filter_trackers" className="font-normal cursor-pointer">
                    {t('qbittorrent.connection.applyToTrackers', 'Apply to trackers')}
                  </Label>
                </div>
              )}
            />
          </div>
        )}

        {/* Manually Banned IPs */}
        <div className="grid gap-2">
          <Label htmlFor="banned_IPs">
            {t('qbittorrent.connection.bannedIPs', 'Manually banned IP addresses')}
          </Label>
          <Controller
            name="banned_IPs"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                id="banned_IPs"
                placeholder={t('qbittorrent.connection.bannedIPsPlaceholder', 'One IP address per line')}
                rows={4}
                className="font-mono text-sm"
              />
            )}
          />
          <p className="text-xs text-muted-foreground">
            {t('qbittorrent.connection.bannedIPsHint', 'Enter one IP address or range per line')}
          </p>
        </div>
      </SettingsSection>

      {/* I2P Settings Section (qBit 5.0+) */}
      {hasI2pSupport && (
        <SettingsSection
          title={t('qbittorrent.connection.i2p.title', 'I2P Anonymous Network')}
          description={t('qbittorrent.connection.i2p.description', 'Configure I2P anonymous network settings (requires qBittorrent 5.0+)')}
          defaultOpen={false}
        >
          <Controller
            name="i2p_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="i2p_enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="i2p_enabled" className="font-normal cursor-pointer">
                  {t('qbittorrent.connection.enableI2p', 'Enable I2P')}
                </Label>
              </div>
            )}
          />

          {i2pEnabled && (
            <div className="space-y-4 ml-6">
              {/* SAM Bridge Settings */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="i2p_address">
                    {t('qbittorrent.connection.i2pAddress', 'SAM bridge address')}
                  </Label>
                  <Controller
                    name="i2p_address"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="i2p_address"
                        placeholder="127.0.0.1"
                      />
                    )}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="i2p_port">
                    {t('qbittorrent.connection.i2pPort', 'SAM bridge port')}
                  </Label>
                  <Controller
                    name="i2p_port"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="i2p_port"
                        type="number"
                        min={1}
                        max={65535}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                      />
                    )}
                  />
                </div>
              </div>

              {/* Mixed Mode */}
              <Controller
                name="i2p_mixed_mode"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="i2p_mixed_mode"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="i2p_mixed_mode" className="font-normal cursor-pointer">
                      {t('qbittorrent.connection.i2pMixedMode', 'Enable mixed mode (I2P and regular connections)')}
                    </Label>
                  </div>
                )}
              />

              {/* Tunnel Quantities */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="i2p_inbound_quantity">
                    {t('qbittorrent.connection.i2pInboundQuantity', 'Inbound tunnels')}
                  </Label>
                  <Controller
                    name="i2p_inbound_quantity"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="i2p_inbound_quantity"
                        type="number"
                        min={1}
                        max={16}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 3)}
                      />
                    )}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="i2p_outbound_quantity">
                    {t('qbittorrent.connection.i2pOutboundQuantity', 'Outbound tunnels')}
                  </Label>
                  <Controller
                    name="i2p_outbound_quantity"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="i2p_outbound_quantity"
                        type="number"
                        min={1}
                        max={16}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 3)}
                      />
                    )}
                  />
                </div>
              </div>

              {/* Tunnel Lengths */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="i2p_inbound_length">
                    {t('qbittorrent.connection.i2pInboundLength', 'Inbound tunnel length (hops)')}
                  </Label>
                  <Controller
                    name="i2p_inbound_length"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="i2p_inbound_length"
                        type="number"
                        min={0}
                        max={7}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 3)}
                      />
                    )}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="i2p_outbound_length">
                    {t('qbittorrent.connection.i2pOutboundLength', 'Outbound tunnel length (hops)')}
                  </Label>
                  <Controller
                    name="i2p_outbound_length"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="i2p_outbound_length"
                        type="number"
                        min={0}
                        max={7}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 3)}
                      />
                    )}
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {t(
                  'qbittorrent.connection.i2pHint',
                  'Higher tunnel lengths provide more anonymity but slower speeds. Typical values: 3 for balance, 0-1 for speed, 5-7 for maximum anonymity.'
                )}
              </p>
            </div>
          )}
        </SettingsSection>
      )}

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
            : t('qbittorrent.connection.saveFailed', 'Failed to save connection settings')}
        </div>
      )}

      {/* Success Display */}
      {updatePreferences.isSuccess && (
        <div className="text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
          {t('qbittorrent.connection.saveSuccess', 'Connection settings saved successfully')}
        </div>
      )}
    </form>
  )
}

/**
 * Connection settings tab wrapper that handles loading state
 */
export function ConnectionSettingsTab() {
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
          {t('qbittorrent.connection.errorLoading', 'Failed to load connection settings')}
        </p>
        {error instanceof Error && (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        )}
      </div>
    )
  }

  return <ConnectionSettings preferences={preferences} />
}
