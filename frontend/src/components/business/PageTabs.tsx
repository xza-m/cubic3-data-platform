/**
 * PageTabs - 统一的标签页组件
 * 在基础 Tabs 之上补齐业务页面常用的排版与字级。
 */
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { Tabs as BaseTabs, TabsContent as BaseTabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const PageTabs = BaseTabs

const PageTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-[0.875rem] bg-muted p-1 text-[0.8125rem] leading-5 text-muted-foreground",
      className,
    )}
    {...props}
  />
))
PageTabsList.displayName = "PageTabsList"

const PageTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-[0.7rem] px-3 py-1.5 text-[0.875rem] font-medium leading-5 ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
))
PageTabsTrigger.displayName = "PageTabsTrigger"

const PageTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <BaseTabsContent
    ref={ref}
    className={cn("mt-3", className)}
    {...props}
  />
))
PageTabsContent.displayName = "PageTabsContent"

export { PageTabs, PageTabsContent, PageTabsList, PageTabsTrigger }
